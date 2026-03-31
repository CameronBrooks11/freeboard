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
import {
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

const resolvers: IResolvers = {
  DashboardVisibility: {
    PRIVATE: "private",
    LINK: "link",
    PUBLIC: "public",
  },
  DashboardAccessLevel: {
    VIEWER: "viewer",
    EDITOR: "editor",
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
      ensureThatUserHasRole(context, ["editor", "admin"]);

      const sanitizedInput = sanitizeDashboardInput(dashboard);
      validateDashboardDatasources(sanitizedInput.datasources);
      await ensureDashboardPayloadAllowedByExecutionMode({
        inputDashboard: sanitizedInput,
      });
      const visibility = await resolveCreateVisibility(sanitizedInput, context);
      delete sanitizedInput.visibility;

      const createdDashboard = await dashboardRepository.create({
        ...sanitizedInput,
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
      ensureThatUserHasRole(context, ["editor", "admin"]);

      const existing = await getDashboardOrNotFound(_id);
      ensureDashboardEditable(existing, context);

      const sanitizedInput = sanitizeDashboardInput(dashboard);
      validateDashboardDatasources(sanitizedInput.datasources);
      await ensureDashboardPayloadAllowedByExecutionMode({
        inputDashboard: sanitizedInput,
        existingDashboard: existing,
      });
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

      const updated = await dashboardRepository.updateById({
        dashboardId: String(_id || "").trim(),
        patch: updatePayload,
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
      pubSub.publish(`dashboard:${transformed._id}`, { dashboard: transformed });
      return transformed;
    },

    deleteDashboard: async (parent, { _id }, context) => {
      ensureThatUserHasRole(context, ["editor", "admin"]);
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

      const permissions = resolveDashboardPermissions(deleted, context);
      return transformDashboardForContext(deleted, context, permissions);
    },

    setDashboardVisibility: async (parent, { _id, visibility }, context) => {
      ensureThatUserHasRole(context, ["editor", "admin"]);

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
      pubSub.publish(`dashboard:${transformed._id}`, { dashboard: transformed });
      return transformed;
    },

    rotateDashboardShareToken: async (parent, { _id }, context) => {
      ensureThatUserHasRole(context, ["editor", "admin"]);
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
      pubSub.publish(`dashboard:${transformed._id}`, { dashboard: transformed });
      return transformed;
    },

    upsertDashboardAccess: async (parent, { _id, email, accessLevel }, context) => {
      ensureThatUserHasRole(context, ["editor", "admin"]);
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
      const nextAcl = uniqueAclEntries([
        ...(existing.acl || []).filter((entry) => toComparableId(entry.userId) !== targetUserId),
        {
          userId: targetUserId,
          accessLevel: normalizedAccessLevel,
          grantedBy: context.user._id,
          grantedAt: new Date(),
        },
      ]);

      const updated = await dashboardRepository.updateById({
        dashboardId: String(_id || "").trim(),
        patch: {
          acl: nextAcl,
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
      pubSub.publish(`dashboard:${transformed._id}`, { dashboard: transformed });
      return transformed;
    },

    revokeDashboardAccess: async (parent, { _id, userId }, context) => {
      ensureThatUserHasRole(context, ["editor", "admin"]);
      const existing = await getDashboardOrNotFound(_id);
      ensureDashboardShareManageable(existing, context);

      const ownerUserId = toComparableId(existing.user);
      const targetUserId = toComparableId(userId);
      if (ownerUserId === targetUserId) {
        throw createGraphQLError("Owner access cannot be revoked from ACL", {
          extensions: { code: "FORBIDDEN" },
        });
      }

      const previousCount = Array.isArray(existing.acl) ? existing.acl.length : 0;
      const nextAcl = (existing.acl || []).filter(
        (entry) => toComparableId(entry.userId) !== targetUserId,
      );

      const updated = await dashboardRepository.updateById({
        dashboardId: String(_id || "").trim(),
        patch: {
          acl: nextAcl,
        },
      });
      if (!updated) {
        throw createGraphQLError("Dashboard not found");
      }

      if (nextAcl.length !== previousCount) {
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
      pubSub.publish(`dashboard:${transformed._id}`, { dashboard: transformed });
      return transformed;
    },

    transferDashboardOwnership: async (parent, { _id, newOwnerUserId }, context) => {
      ensureThatUserHasRole(context, ["editor", "admin"]);
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
      pubSub.publish(`dashboard:${transformed._id}`, { dashboard: transformed });
      return transformed;
    },
  },

  Subscription: {
    dashboard: {
      subscribe: async (_, args, context) => {
        ensureThatUserIsLogged(context);

        const dashboard = await dashboardRepository.findById({
          dashboardId: String(args._id || "").trim(),
        });
        if (!dashboard) {
          throw createGraphQLError("Dashboard not found");
        }

        const permissions = resolveDashboardPermissions(dashboard, context);
        if (!permissions.canRead) {
          throw createGraphQLError("Dashboard not found");
        }

        return pubSub.subscribe(`dashboard:${args._id}`);
      },
    },
  },
};

export default resolvers;
