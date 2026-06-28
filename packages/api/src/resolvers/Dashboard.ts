/**
 * @module resolvers/Dashboard
 * GraphQL resolver implementations for dashboard visibility, sharing, and ACL flows.
 */

import { createGraphQLError, createPubSub } from "graphql-yoga";
import type { IResolvers } from "@graphql-tools/utils";
import { ensureThatUserHasRole, ensureThatUserIsLogged } from "../auth.js";
import { recordAuditEvent } from "../audit.js";
import { getAuthPolicyState } from "../policyStore.js";
import { dataStore } from "../data/index.js";
import { DashboardRevisionConflictError } from "../data/contracts.js";
import {
  assertValidDashboardDocument,
  buildCollaboratorView,
  ensureDashboardDeletable,
  ensureDashboardEditable,
  ensureDashboardOwnershipTransferAllowed,
  ensureDashboardPayloadAllowedByExecutionMode,
  ensureDashboardReadable,
  ensureDashboardShareManageable,
  ensureVisibilityTransitionAllowed,
  generateShareToken,
  getDashboardOrNotFound,
  getDashboardVisibility,
  inputDatasources,
  recordShareTokenRevocation,
  resolveCreateVisibility,
  resolveDashboardPermissions,
  sanitizeDashboardInput,
  toComparableId,
  transformDashboardForContext,
  uniqueAclEntries,
  validateDashboardDatasources,
} from "./dashboardHelpers.js";
import { normalizeDashboardAccessLevel, normalizeDashboardVisibility } from "../policy.js";
import { isValidEmail, normalizeEmail } from "../validators.js";

const pubSub = createPubSub();
const EXTERNALLY_VISIBLE_DASHBOARD_VISIBILITIES = new Set(["link", "public"]);
const userRepository = dataStore.repositories.users;
const dashboardRepository = dataStore.repositories.dashboards;

const dashboardTopic = (dashboardId: unknown) => `dashboard:${String(dashboardId)}`;

/**
 * Notify subscribers that a dashboard changed. The event carries ONLY the id —
 * never a per-actor projection. Each subscriber's stream re-fetches and
 * re-authorizes against its own context (see the Subscription resolver), so the
 * mutating actor's shareToken/ACL/ownership flags can never leak to other
 * subscribers.
 */
const publishDashboardChanged = (dashboardId: unknown) => {
  const id = String(dashboardId);
  pubSub.publish(dashboardTopic(id), { dashboardId: id });
};

/**
 * Read a required `expectedDocumentRevision` (positive integer) off a raw update
 * input. A document write must carry it so the optimistic-concurrency guard
 * can't be skipped by a non-UI client; GraphQL can't express conditional
 * requiredness, so it's enforced here.
 */
const readRequiredExpectedDocumentRevision = (input: unknown): number => {
  const raw =
    input && typeof input === "object"
      ? (input as Record<string, unknown>).expectedDocumentRevision
      : undefined;
  if (typeof raw !== "number" || !Number.isInteger(raw) || raw < 1) {
    throw createGraphQLError(
      "expectedDocumentRevision (a positive integer) is required when updating the document.",
      { extensions: { code: "BAD_USER_INPUT" } },
    );
  }
  return raw;
};

/**
 * Run a dashboard update, translating an optimistic-concurrency conflict into a
 * GraphQL CONFLICT error (carrying the current revision) the client can act on.
 */
const updateDashboardOrConflict = async (params: {
  dashboardId: string;
  patch: Parameters<typeof dashboardRepository.updateById>[0]["patch"];
  expectedDocumentRevision?: number | undefined;
}) => {
  try {
    return await dashboardRepository.updateById(params);
  } catch (error) {
    if (error instanceof DashboardRevisionConflictError) {
      throw createGraphQLError(
        "Dashboard was changed since you loaded it. Reload to get the latest version.",
        { extensions: { code: "CONFLICT", currentRevision: error.currentRevision } },
      );
    }
    throw error;
  }
};

const resolvers: IResolvers = {
  DashboardVisibility: {
    PRIVATE: "private",
    LINK: "link",
    PUBLIC: "public",
  },
  DashboardAccessLevel: {
    VIEWER: "viewer",
    EDITOR: "editor",
    MANAGER: "manager",
  },
  Query: {
    dashboard: async (parent, { _id }, context) => {
      const dashboard = await getDashboardOrNotFound(_id);
      const permissions = ensureDashboardReadable(dashboard, context);
      return transformDashboardForContext(dashboard, context, permissions);
    },

    dashboardByShareToken: async (parent, { shareToken }, context) => {
      const normalizedToken = String(shareToken || "").trim();
      if (!normalizedToken) {
        throw createGraphQLError("Dashboard not found");
      }

      const dashboard = await dashboardRepository.findByShareToken({
        shareToken: normalizedToken,
      });
      if (!dashboard) {
        throw createGraphQLError("Dashboard not found");
      }

      const permissions = ensureDashboardReadable(dashboard, context, {
        shareTokenMatched: true,
      });
      return transformDashboardForContext(dashboard, context, permissions);
    },

    dashboards: async (parent, args, context) => {
      ensureThatUserIsLogged(context);

      let dashboards: Awaited<ReturnType<typeof dashboardRepository.listAll>>;
      if (context.user.role === "admin") {
        dashboards = await dashboardRepository.listAll();
      } else {
        const authPolicy = await getAuthPolicyState();
        dashboards = await dashboardRepository.listAccessible({
          viewerUserId: String(context.user._id || "").trim(),
          includePublic: authPolicy.dashboardPublicListingEnabled,
        });
      }
      return dashboards
        .map((dashboard) => {
          const permissions = resolveDashboardPermissions(dashboard, context);
          if (!permissions.canRead) {
            return null;
          }
          return transformDashboardForContext(dashboard, context, permissions);
        })
        .filter(Boolean);
    },

    dashboardCollaborators: async (parent, { _id }, context) => {
      ensureThatUserIsLogged(context);
      const dashboard = await getDashboardOrNotFound(_id);
      ensureDashboardShareManageable(dashboard, context);
      return buildCollaboratorView(dashboard);
    },
  },

  Mutation: {
    createDashboard: async (parent, { dashboard }, context) => {
      // Creating a NEW dashboard requires the global editor/admin role. Editing
      // an existing one is governed per-dashboard by ACL/ownership (see the
      // ensureDashboard* gates), independent of global role.
      ensureThatUserHasRole(context, ["editor", "admin"]);

      const sanitizedInput = sanitizeDashboardInput(dashboard);
      validateDashboardDatasources(inputDatasources(sanitizedInput));
      await ensureDashboardPayloadAllowedByExecutionMode({
        inputDashboard: sanitizedInput,
      });
      // The create must carry a valid v1 document (after the cheaper datasource
      // + execution-mode gates). Persist the canonical (migrated) document.
      const document = assertValidDashboardDocument(sanitizedInput.document);
      const visibility = await resolveCreateVisibility(sanitizedInput, context);

      const createdDashboard = await dashboardRepository.create({
        document,
        visibility,
        user: context.user._id,
      });
      if (!createdDashboard) {
        throw createGraphQLError("Dashboard not found");
      }

      await recordAuditEvent({
        actorUserId: context.user._id,
        action: "dashboard.created",
        targetType: "dashboard",
        targetId: createdDashboard._id,
        metadata: { visibility: createdDashboard.visibility },
      });

      const permissions = resolveDashboardPermissions(createdDashboard, context);
      const transformed = transformDashboardForContext(createdDashboard, context, permissions);
      return transformed;
    },

    updateDashboard: async (parent, { _id, dashboard }, context) => {
      ensureThatUserIsLogged(context);

      const existing = await getDashboardOrNotFound(_id);
      ensureDashboardEditable(existing, context);

      const sanitizedInput = sanitizeDashboardInput(dashboard);
      // Visibility is envelope state with its own mutation; bundling it with a
      // document write would dodge the document-revision guard and let a stale
      // save silently revert (or re-expose) a concurrent visibility change.
      if (
        Object.prototype.hasOwnProperty.call(sanitizedInput, "document") &&
        Object.prototype.hasOwnProperty.call(sanitizedInput, "visibility")
      ) {
        throw createGraphQLError(
          "Change visibility with setDashboardVisibility, not in a document update.",
          { extensions: { code: "BAD_USER_INPUT" } },
        );
      }
      validateDashboardDatasources(inputDatasources(sanitizedInput));
      await ensureDashboardPayloadAllowedByExecutionMode({
        inputDashboard: sanitizedInput,
        existingDashboard: existing,
      });
      // A document write must be valid v1; persist the canonical (migrated) form.
      // Envelope-only edits carry no document and leave the (already-valid) stored
      // document untouched.
      if (sanitizedInput.document !== undefined) {
        sanitizedInput.document = assertValidDashboardDocument(sanitizedInput.document);
      }
      const updatePayload = { ...sanitizedInput };
      let nextShareTokenVersion = null;

      if (Object.prototype.hasOwnProperty.call(sanitizedInput, "visibility")) {
        const previousVisibility = getDashboardVisibility(existing);
        const nextVisibility = normalizeDashboardVisibility(sanitizedInput.visibility);
        await ensureVisibilityTransitionAllowed({
          context,
          previousVisibility,
          nextVisibility,
        });
        updatePayload.visibility = nextVisibility;
        const shouldExposeExternally =
          EXTERNALLY_VISIBLE_DASHBOARD_VISIBILITIES.has(nextVisibility);
        const shouldRotateShareToken = shouldExposeExternally && previousVisibility === "private";
        const visibilityChanged = nextVisibility !== previousVisibility;
        if (shouldExposeExternally && (shouldRotateShareToken || !existing.shareToken)) {
          updatePayload.shareToken = generateShareToken();
        }
        if (visibilityChanged) {
          nextShareTokenVersion = Math.max(0, Number(existing.shareTokenVersion) || 0) + 1;
          updatePayload.shareTokenVersion = nextShareTokenVersion;
        }
      }

      // A document write must guard against a stale revision; envelope-only
      // edits (visibility, etc.) don't touch the document and don't require it.
      // `expectedDocumentRevision` is read from the raw input because
      // sanitizeDashboardInput strips it from `updatePayload`.
      const isDocumentWrite = Object.prototype.hasOwnProperty.call(updatePayload, "document");
      const updated = await updateDashboardOrConflict({
        dashboardId: String(_id || "").trim(),
        patch: updatePayload,
        expectedDocumentRevision: isDocumentWrite
          ? readRequiredExpectedDocumentRevision(dashboard)
          : undefined,
      });
      if (!updated) {
        throw createGraphQLError("Dashboard not found");
      }

      if (nextShareTokenVersion !== null) {
        await recordShareTokenRevocation({
          dashboardId: updated._id,
          shareTokenVersion: nextShareTokenVersion,
        });
      }

      await recordAuditEvent({
        actorUserId: context.user._id,
        action: "dashboard.updated",
        targetType: "dashboard",
        targetId: updated._id,
        metadata: { fields: Object.keys(updatePayload) },
      });

      const permissions = resolveDashboardPermissions(updated, context);
      const transformed = transformDashboardForContext(updated, context, permissions);
      publishDashboardChanged(updated._id);
      return transformed;
    },

    deleteDashboard: async (parent, { _id }, context) => {
      ensureThatUserIsLogged(context);
      const existing = await getDashboardOrNotFound(_id);
      ensureDashboardDeletable(existing, context);

      const deleted = await dashboardRepository.deleteById({
        dashboardId: String(_id || "").trim(),
      });
      if (!deleted) {
        throw createGraphQLError("Dashboard not found");
      }

      await recordAuditEvent({
        actorUserId: context.user._id,
        action: "dashboard.deleted",
        targetType: "dashboard",
        targetId: deleted._id,
        metadata: { visibility: getDashboardVisibility(deleted) },
      });

      // Notify subscribers so their streams re-fetch, find the dashboard gone,
      // and close cleanly instead of blocking forever on a deleted board.
      publishDashboardChanged(deleted._id);

      const permissions = resolveDashboardPermissions(deleted, context);
      return transformDashboardForContext(deleted, context, permissions);
    },

    setDashboardVisibility: async (parent, { _id, visibility }, context) => {
      ensureThatUserIsLogged(context);

      const existing = await getDashboardOrNotFound(_id);
      ensureDashboardShareManageable(existing, context);

      const previousVisibility = getDashboardVisibility(existing);
      const nextVisibility = normalizeDashboardVisibility(visibility);
      await ensureVisibilityTransitionAllowed({
        context,
        previousVisibility,
        nextVisibility,
      });
      const shouldExposeExternally = EXTERNALLY_VISIBLE_DASHBOARD_VISIBILITIES.has(nextVisibility);
      const shouldRotateShareToken = shouldExposeExternally && previousVisibility === "private";
      const visibilityChanged = nextVisibility !== previousVisibility;
      const shareTokenUpdate =
        shouldExposeExternally && (shouldRotateShareToken || !existing.shareToken)
          ? { shareToken: generateShareToken() }
          : {};
      const nextShareTokenVersion = visibilityChanged
        ? Math.max(0, Number(existing.shareTokenVersion) || 0) + 1
        : null;
      const shareTokenVersionUpdate =
        nextShareTokenVersion === null ? {} : { shareTokenVersion: nextShareTokenVersion };

      const updated = await dashboardRepository.updateById({
        dashboardId: String(_id || "").trim(),
        patch: {
          visibility: nextVisibility,
          ...shareTokenUpdate,
          ...shareTokenVersionUpdate,
        },
      });
      if (!updated) {
        throw createGraphQLError("Dashboard not found");
      }

      if (nextShareTokenVersion !== null) {
        await recordShareTokenRevocation({
          dashboardId: updated._id,
          shareTokenVersion: nextShareTokenVersion,
        });
      }

      await recordAuditEvent({
        actorUserId: context.user._id,
        action: "dashboard.visibility.updated",
        targetType: "dashboard",
        targetId: updated._id,
        metadata: {
          from: previousVisibility,
          to: nextVisibility,
        },
      });

      const permissions = resolveDashboardPermissions(updated, context);
      const transformed = transformDashboardForContext(updated, context, permissions);
      publishDashboardChanged(updated._id);
      return transformed;
    },

    rotateDashboardShareToken: async (parent, { _id }, context) => {
      ensureThatUserIsLogged(context);
      const existing = await getDashboardOrNotFound(_id);
      ensureDashboardShareManageable(existing, context);
      const nextShareTokenVersion = Math.max(0, Number(existing.shareTokenVersion) || 0) + 1;

      const updated = await dashboardRepository.updateById({
        dashboardId: String(_id || "").trim(),
        patch: {
          shareToken: generateShareToken(),
          shareTokenVersion: nextShareTokenVersion,
        },
      });
      if (!updated) {
        throw createGraphQLError("Dashboard not found");
      }

      await recordShareTokenRevocation({
        dashboardId: updated._id,
        shareTokenVersion: nextShareTokenVersion,
      });

      await recordAuditEvent({
        actorUserId: context.user._id,
        action: "dashboard.share_token.rotated",
        targetType: "dashboard",
        targetId: updated._id,
        metadata: { visibility: updated.visibility },
      });

      const permissions = resolveDashboardPermissions(updated, context);
      const transformed = transformDashboardForContext(updated, context, permissions);
      publishDashboardChanged(updated._id);
      return transformed;
    },

    upsertDashboardAccess: async (parent, { _id, email, accessLevel }, context) => {
      ensureThatUserIsLogged(context);
      const existing = await getDashboardOrNotFound(_id);
      ensureDashboardShareManageable(existing, context);

      const normalizedEmail = normalizeEmail(email);
      if (!isValidEmail(normalizedEmail)) {
        throw createGraphQLError("The email is not valid");
      }
      const userByEmail = await userRepository.findByEmail({
        email: normalizedEmail,
      });
      const user = userByEmail?.active ? userByEmail : null;
      if (!user) {
        throw createGraphQLError("User not found or login not allowed");
      }

      const ownerUserId = toComparableId(existing.user);
      const targetUserId = toComparableId(user._id);
      if (ownerUserId === targetUserId) {
        throw createGraphQLError("Owner access is managed through ownership only", {
          extensions: { code: "FORBIDDEN" },
        });
      }

      const normalizedAccessLevel = normalizeDashboardAccessLevel(accessLevel);
      // Atomic single-entry upsert so a concurrent grant/revoke isn't lost to a
      // full-array last-writer-wins replacement.
      const updated = await dashboardRepository.upsertAclEntry({
        dashboardId: String(_id || "").trim(),
        entry: {
          userId: String(targetUserId || ""),
          accessLevel: normalizedAccessLevel,
          grantedBy: toComparableId(context.user._id),
          grantedAt: new Date(),
        },
      });
      if (!updated) {
        throw createGraphQLError("Dashboard not found");
      }

      await recordAuditEvent({
        actorUserId: context.user._id,
        action: "dashboard.acl.upserted",
        targetType: "dashboard",
        targetId: updated._id,
        metadata: {
          userId: targetUserId,
          accessLevel: normalizedAccessLevel,
        },
      });

      const permissions = resolveDashboardPermissions(updated, context);
      const transformed = transformDashboardForContext(updated, context, permissions);
      publishDashboardChanged(updated._id);
      return transformed;
    },

    revokeDashboardAccess: async (parent, { _id, userId }, context) => {
      ensureThatUserIsLogged(context);
      const existing = await getDashboardOrNotFound(_id);
      ensureDashboardShareManageable(existing, context);

      const ownerUserId = toComparableId(existing.user);
      const targetUserId = toComparableId(userId);
      if (ownerUserId === targetUserId) {
        throw createGraphQLError("Owner access cannot be revoked from ACL", {
          extensions: { code: "FORBIDDEN" },
        });
      }

      const wasPresent = (existing.acl || []).some(
        (entry) => toComparableId(entry.userId) === targetUserId,
      );

      // Atomic keyed delete so a concurrent grant to another user isn't undone.
      const updated = await dashboardRepository.deleteAclEntry({
        dashboardId: String(_id || "").trim(),
        userId: String(targetUserId || ""),
      });
      if (!updated) {
        throw createGraphQLError("Dashboard not found");
      }

      if (wasPresent) {
        await recordAuditEvent({
          actorUserId: context.user._id,
          action: "dashboard.acl.revoked",
          targetType: "dashboard",
          targetId: updated._id,
          metadata: { userId: targetUserId },
        });
      }

      const permissions = resolveDashboardPermissions(updated, context);
      const transformed = transformDashboardForContext(updated, context, permissions);
      publishDashboardChanged(updated._id);
      return transformed;
    },

    transferDashboardOwnership: async (parent, { _id, newOwnerUserId }, context) => {
      ensureThatUserIsLogged(context);
      const existing = await getDashboardOrNotFound(_id);
      ensureDashboardOwnershipTransferAllowed(existing, context);

      const nextOwner = await userRepository.findActiveById({
        userId: String(newOwnerUserId || "").trim(),
      });
      if (!nextOwner) {
        throw createGraphQLError("User not found or login not allowed");
      }

      const currentOwnerUserId = toComparableId(existing.user);
      const targetOwnerUserId = toComparableId(nextOwner._id);
      if (currentOwnerUserId === targetOwnerUserId) {
        const permissions = resolveDashboardPermissions(existing, context);
        return transformDashboardForContext(existing, context, permissions);
      }

      const nextAcl = uniqueAclEntries([
        ...(existing.acl || []).filter((entry) => {
          const entryUserId = toComparableId(entry.userId);
          return entryUserId !== currentOwnerUserId && entryUserId !== targetOwnerUserId;
        }),
        {
          userId: currentOwnerUserId,
          accessLevel: "editor",
          grantedBy: context.user._id,
          grantedAt: new Date(),
        },
      ]);

      const updated = await dashboardRepository.updateById({
        dashboardId: String(_id || "").trim(),
        patch: {
          user: targetOwnerUserId,
          acl: nextAcl,
        },
      });
      if (!updated) {
        throw createGraphQLError("Dashboard not found");
      }

      await recordAuditEvent({
        actorUserId: context.user._id,
        action: "dashboard.ownership.transferred",
        targetType: "dashboard",
        targetId: updated._id,
        metadata: {
          fromUserId: currentOwnerUserId,
          toUserId: targetOwnerUserId,
        },
      });

      const permissions = resolveDashboardPermissions(updated, context);
      const transformed = transformDashboardForContext(updated, context, permissions);
      publishDashboardChanged(updated._id);
      return transformed;
    },
  },

  Subscription: {
    dashboard: {
      subscribe: async (_, args, context) => {
        ensureThatUserIsLogged(context);

        const dashboardId = String(args._id || "").trim();
        const dashboard = await dashboardRepository.findById({ dashboardId });
        if (!dashboard) {
          throw createGraphQLError("Dashboard not found");
        }

        if (!resolveDashboardPermissions(dashboard, context).canRead) {
          throw createGraphQLError("Dashboard not found");
        }

        // Re-fetch, re-authorize, and re-project on EVERY event against this
        // subscriber's own context — never relay the mutating actor's
        // projection. Close the stream if the dashboard is gone or this
        // subscriber's read access was revoked mid-subscription.
        const source = pubSub.subscribe(dashboardTopic(dashboardId));
        return (async function* () {
          for await (const event of source) {
            // The event is a bare change signal; authoritative state comes from
            // the re-fetch below, never from the (untrusted) payload.
            void event;
            const current = await dashboardRepository.findById({ dashboardId });
            if (!current) {
              return;
            }
            const permissions = resolveDashboardPermissions(current, context);
            if (!permissions.canRead) {
              return;
            }
            yield { dashboard: transformDashboardForContext(current, context, permissions) };
          }
        })();
      },
    },
  },
};

export default resolvers;
