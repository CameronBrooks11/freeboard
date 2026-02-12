/**
 * @module resolvers/Dashboard
 * @description GraphQL resolver implementations for dashboard visibility, sharing, and ACL flows.
 */

import crypto from "node:crypto";
import { createGraphQLError, createPubSub } from "graphql-yoga";
import {
  ensureThatUserHasRole,
  ensureThatUserIsLogged,
} from "../auth.js";
import { recordAuditEvent } from "../audit.js";
import Dashboard from "../models/Dashboard.js";
import User from "../models/User.js";
import { getAuthPolicyState } from "../policyStore.js";
import {
  normalizeDashboardAccessLevel,
  normalizeDashboardVisibility,
} from "../policy.js";
import { isValidEmail, normalizeEmail } from "../validators.js";
import { transformDashboard } from "./merge.js";

const pubSub = createPubSub();

const DASHBOARD_MUTABLE_FIELDS = new Set([
  "title",
  "version",
  "visibility",
  "image",
  "datasources",
  "columns",
  "width",
  "panes",
  "authProviders",
  "settings",
]);

const EXTERNALLY_VISIBLE_DASHBOARD_VISIBILITIES = new Set(["link", "public"]);

const generateShareToken = () => crypto.randomBytes(24).toString("base64url");

const toComparableId = (value) => {
  if (!value) {
    return null;
  }
  if (typeof value?.toString === "function") {
    return value.toString();
  }
  return String(value);
};

const getDashboardVisibility = (dashboard) => {
  if (typeof dashboard?.visibility === "string") {
    try {
      return normalizeDashboardVisibility(dashboard.visibility);
    } catch {
      // fall through to default
    }
  }
  return "private";
};

const toTrimmedString = (value) =>
  typeof value === "string" ? value.trim() : "";

const normalizeResourceList = (resources) => {
  if (!Array.isArray(resources)) {
    return [];
  }
  const normalized = resources
    .map((entry) => {
      if (typeof entry === "string") {
        return entry.trim();
      }
      if (entry && typeof entry === "object") {
        if (typeof entry.url === "string") {
          return entry.url.trim();
        }
        if (typeof entry.asset === "string") {
          return entry.asset.trim();
        }
      }
      return "";
    })
    .filter(Boolean);
  normalized.sort();
  return normalized;
};

const hasTrustedDashboardSettings = (settings) => {
  if (!settings || typeof settings !== "object") {
    return false;
  }
  return Boolean(
    toTrimmedString(settings.script) ||
      toTrimmedString(settings.style) ||
      normalizeResourceList(settings.resources).length > 0
  );
};

const trustedDashboardSettingsSignature = (settings) =>
  JSON.stringify({
    script: toTrimmedString(settings?.script),
    style: toTrimmedString(settings?.style),
    resources: normalizeResourceList(settings?.resources),
  });

const normalizeWidgetType = (widget) =>
  String(widget?.typeName || widget?.type || "")
    .trim()
    .toLowerCase();

const trustedWidgetPayloadSignatures = (panes) => {
  if (!Array.isArray(panes)) {
    return [];
  }

  const signatures = [];
  panes.forEach((pane, paneIndex) => {
    const widgets = Array.isArray(pane?.widgets) ? pane.widgets : [];
    widgets.forEach((widget, widgetIndex) => {
      const widgetType = normalizeWidgetType(widget);
      const widgetSettings =
        widget?.settings && typeof widget.settings === "object"
          ? widget.settings
          : {};
      const widgetKey = toTrimmedString(widget?.id) || `${paneIndex}:${widgetIndex}`;

      if (widgetType === "html") {
        const mode = toTrimmedString(widgetSettings.mode).toLowerCase();
        if (mode === "trusted_html") {
          signatures.push(`html:${widgetKey}:trusted_html`);
        }
      }

      if (widgetType === "base") {
        const script = toTrimmedString(widgetSettings.script);
        const resources = normalizeResourceList(widgetSettings.resources);
        if (script || resources.length > 0) {
          signatures.push(
            `base:${widgetKey}:${script}:${JSON.stringify(resources)}`
          );
        }
      }
    });
  });

  signatures.sort();
  return signatures;
};

const ensureDashboardPayloadAllowedByExecutionMode = async ({
  inputDashboard,
  existingDashboard = null,
}) => {
  if (!inputDashboard || typeof inputDashboard !== "object") {
    return;
  }

  const hasTrustedSettingsInInput =
    Object.prototype.hasOwnProperty.call(inputDashboard, "settings") &&
    hasTrustedDashboardSettings(inputDashboard.settings);
  const inputTrustedWidgetSignatures = Object.prototype.hasOwnProperty.call(
    inputDashboard,
    "panes"
  )
    ? trustedWidgetPayloadSignatures(inputDashboard.panes)
    : [];

  if (!hasTrustedSettingsInInput && inputTrustedWidgetSignatures.length === 0) {
    return;
  }

  const authPolicy = await getAuthPolicyState();
  if (authPolicy.executionMode === "trusted") {
    return;
  }

  if (Object.prototype.hasOwnProperty.call(inputDashboard, "settings")) {
    if (
      hasTrustedSettingsInInput &&
      trustedDashboardSettingsSignature(inputDashboard.settings) !==
        trustedDashboardSettingsSignature(existingDashboard?.settings)
    ) {
      throw createGraphQLError(
        "Trusted dashboard settings require execution mode 'trusted'",
        {
          extensions: { code: "FORBIDDEN" },
        }
      );
    }
  }

  if (Object.prototype.hasOwnProperty.call(inputDashboard, "panes")) {
    if (inputTrustedWidgetSignatures.length > 0) {
      const existingTrustedWidgetSignatures = trustedWidgetPayloadSignatures(
        existingDashboard?.panes
      );
      if (
        JSON.stringify(inputTrustedWidgetSignatures) !==
        JSON.stringify(existingTrustedWidgetSignatures)
      ) {
        throw createGraphQLError(
          "Trusted widget capabilities require execution mode 'trusted'",
          {
            extensions: { code: "FORBIDDEN" },
          }
        );
      }
    }
  }
};

const sanitizeDashboardInput = (dashboard = {}) => {
  const sanitized = {};
  for (const [key, value] of Object.entries(dashboard || {})) {
    if (DASHBOARD_MUTABLE_FIELDS.has(key)) {
      sanitized[key] = value;
    }
  }
  return sanitized;
};

const getAclEntry = (dashboard, userId) => {
  const normalizedUserId = toComparableId(userId);
  if (!normalizedUserId || !Array.isArray(dashboard?.acl)) {
    return null;
  }
  return (
    dashboard.acl.find(
      (entry) => toComparableId(entry?.userId) === normalizedUserId
    ) || null
  );
};

const resolveDashboardPermissions = (
  dashboard,
  context,
  { shareTokenMatched = false } = {}
) => {
  if (!dashboard) {
    return {
      canRead: false,
      canEdit: false,
      canManageSharing: false,
      canDelete: false,
      isOwner: false,
    };
  }

  const visibility = getDashboardVisibility(dashboard);
  const viewerUserId = toComparableId(context.user?._id || null);
  const ownerUserId = toComparableId(dashboard.user);
  const viewerRole = context.user?.role || null;
  const isAdmin = viewerRole === "admin";
  const isOwner = Boolean(viewerUserId && ownerUserId === viewerUserId);
  const aclEntry = getAclEntry(dashboard, viewerUserId);
  const aclAccessLevel = aclEntry?.accessLevel || null;

  const canRead =
    isAdmin ||
    isOwner ||
    Boolean(aclAccessLevel) ||
    visibility === "public" ||
    (visibility === "link" && shareTokenMatched);

  const canEdit = isAdmin || isOwner || aclAccessLevel === "editor";
  const canManageSharing = isAdmin || isOwner || aclAccessLevel === "editor";
  const canDelete = isAdmin || isOwner || aclAccessLevel === "editor";

  return {
    canRead,
    canEdit,
    canManageSharing,
    canDelete,
    isOwner,
  };
};

const transformDashboardForContext = (dashboard, context, permissions) =>
  transformDashboard(dashboard, context.user?._id || null, {
    canEdit: permissions.canEdit,
    canManageSharing: permissions.canManageSharing,
  });

const getDashboardOrNotFound = async (_id) => {
  const dashboard = await Dashboard.findOne({ _id }).lean();
  if (!dashboard) {
    throw createGraphQLError("Dashboard not found");
  }
  return dashboard;
};

const ensureDashboardReadable = (dashboard, context, options = {}) => {
  const permissions = resolveDashboardPermissions(dashboard, context, options);
  if (!permissions.canRead) {
    throw createGraphQLError("Dashboard not found");
  }
  return permissions;
};

const ensureDashboardEditable = (dashboard, context) => {
  const permissions = resolveDashboardPermissions(dashboard, context);
  if (!permissions.canEdit) {
    throw createGraphQLError("Dashboard not found");
  }
  return permissions;
};

const ensureDashboardShareManageable = (dashboard, context) => {
  const permissions = resolveDashboardPermissions(dashboard, context);
  if (!permissions.canManageSharing) {
    throw createGraphQLError("Dashboard not found");
  }
  return permissions;
};

const ensureDashboardOwnershipTransferAllowed = (dashboard, context) => {
  const permissions = resolveDashboardPermissions(dashboard, context);
  if (!(permissions.isOwner || context.user?.role === "admin")) {
    throw createGraphQLError("Dashboard not found");
  }
  return permissions;
};

const ensureDashboardDeletable = (dashboard, context) => {
  const permissions = resolveDashboardPermissions(dashboard, context);
  if (!permissions.canDelete) {
    throw createGraphQLError("Dashboard not found");
  }
  return permissions;
};

const ensureVisibilityTransitionAllowed = async ({
  context,
  previousVisibility,
  nextVisibility,
}) => {
  if (nextVisibility === previousVisibility) {
    return;
  }

  if (context.user?.role === "admin") {
    return;
  }

  if (!EXTERNALLY_VISIBLE_DASHBOARD_VISIBILITIES.has(nextVisibility)) {
    return;
  }

  const authPolicy = await getAuthPolicyState();
  if (!authPolicy.editorCanPublish) {
    throw createGraphQLError("Editors are not allowed to publish dashboards", {
      extensions: { code: "FORBIDDEN" },
    });
  }
};

const resolveCreateVisibility = async (inputDashboard, context) => {
  const hasVisibility = Object.prototype.hasOwnProperty.call(
    inputDashboard || {},
    "visibility"
  );
  const authPolicy = await getAuthPolicyState();

  let visibility = hasVisibility
    ? normalizeDashboardVisibility(inputDashboard.visibility)
    : normalizeDashboardVisibility(authPolicy.dashboardDefaultVisibility);

  if (
    context.user?.role !== "admin" &&
    EXTERNALLY_VISIBLE_DASHBOARD_VISIBILITIES.has(visibility) &&
    !authPolicy.editorCanPublish
  ) {
    if (hasVisibility) {
      throw createGraphQLError("Editors are not allowed to publish dashboards", {
        extensions: { code: "FORBIDDEN" },
      });
    }
    visibility = "private";
  }

  return visibility;
};

const uniqueAclEntries = (entries = []) => {
  const byUserId = new Map();
  entries.forEach((entry) => {
    const userId = toComparableId(entry?.userId);
    if (!userId) {
      return;
    }
    byUserId.set(userId, {
      userId,
      accessLevel: normalizeDashboardAccessLevel(entry.accessLevel),
      grantedBy: toComparableId(entry.grantedBy) || null,
      grantedAt: entry.grantedAt || new Date(),
    });
  });
  return [...byUserId.values()];
};

const buildCollaboratorView = async (dashboard) => {
  const ownerUserId = toComparableId(dashboard.user);
  const aclEntries = uniqueAclEntries(dashboard.acl || []);
  const userIds = [
    ownerUserId,
    ...aclEntries.map((entry) => toComparableId(entry.userId)),
  ].filter(Boolean);

  const users = await User.find({ _id: { $in: userIds } })
    .select("_id email")
    .lean();
  const emailByUserId = new Map(
    users.map((user) => [toComparableId(user._id), user.email])
  );

  const collaborators = [
    {
      userId: ownerUserId,
      email: emailByUserId.get(ownerUserId) || null,
      accessLevel: "editor",
      isOwner: true,
    },
  ];

  aclEntries.forEach((entry) => {
    const userId = toComparableId(entry.userId);
    if (!userId || userId === ownerUserId) {
      return;
    }
    collaborators.push({
      userId,
      email: emailByUserId.get(userId) || null,
      accessLevel: entry.accessLevel,
      isOwner: false,
    });
  });

  return collaborators;
};

export default {
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

      const dashboard = await Dashboard.findOne({ shareToken: normalizedToken }).lean();
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

      const userId = toComparableId(context.user._id);
      let filter = {};
      if (context.user.role !== "admin") {
        const authPolicy = await getAuthPolicyState();
        const scopedFilters = [
          { user: userId },
          { acl: { $elemMatch: { userId } } },
        ];
        if (authPolicy.dashboardPublicListingEnabled) {
          scopedFilters.push({ visibility: "public" });
        }
        filter = { $or: scopedFilters };
      }

      const dashboards = await Dashboard.find(filter).lean();
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
      await ensureDashboardPayloadAllowedByExecutionMode({
        inputDashboard: sanitizedInput,
      });
      const visibility = await resolveCreateVisibility(sanitizedInput, context);
      delete sanitizedInput.visibility;

      const created = await new Dashboard({
        ...sanitizedInput,
        visibility,
        user: context.user._id,
      }).save();

      const createdDashboard = await Dashboard.findOne({ _id: created._id }).lean();
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
      return transformDashboardForContext(createdDashboard, context, permissions);
    },

    updateDashboard: async (parent, { _id, dashboard }, context) => {
      ensureThatUserHasRole(context, ["editor", "admin"]);

      const existing = await getDashboardOrNotFound(_id);
      ensureDashboardEditable(existing, context);

      const sanitizedInput = sanitizeDashboardInput(dashboard);
      await ensureDashboardPayloadAllowedByExecutionMode({
        inputDashboard: sanitizedInput,
        existingDashboard: existing,
      });
      const updatePayload = { ...sanitizedInput };

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
        const shouldRotateShareToken =
          shouldExposeExternally && previousVisibility === "private";
        if (
          shouldExposeExternally &&
          (shouldRotateShareToken || !existing.shareToken)
        ) {
          updatePayload.shareToken = generateShareToken();
        }
      }

      const updated = await Dashboard.findOneAndUpdate(
        { _id },
        { $set: updatePayload },
        { new: true, runValidators: true }
      ).lean();
      if (!updated) {
        throw createGraphQLError("Dashboard not found");
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

      const deleted = await Dashboard.findOneAndDelete({ _id }).lean();
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
      const shouldExposeExternally =
        EXTERNALLY_VISIBLE_DASHBOARD_VISIBILITIES.has(nextVisibility);
      const shouldRotateShareToken =
        shouldExposeExternally && previousVisibility === "private";
      const shareTokenUpdate =
        shouldExposeExternally &&
        (shouldRotateShareToken || !existing.shareToken)
          ? { shareToken: generateShareToken() }
          : {};

      const updated = await Dashboard.findOneAndUpdate(
        { _id },
        {
          $set: {
            visibility: nextVisibility,
            ...shareTokenUpdate,
          },
        },
        { new: true, runValidators: true }
      ).lean();
      if (!updated) {
        throw createGraphQLError("Dashboard not found");
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

      const updated = await Dashboard.findOneAndUpdate(
        { _id },
        { $set: { shareToken: generateShareToken() } },
        { new: true, runValidators: true }
      ).lean();
      if (!updated) {
        throw createGraphQLError("Dashboard not found");
      }

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

    upsertDashboardAccess: async (
      parent,
      { _id, email, accessLevel },
      context
    ) => {
      ensureThatUserHasRole(context, ["editor", "admin"]);
      const existing = await getDashboardOrNotFound(_id);
      ensureDashboardShareManageable(existing, context);

      const normalizedEmail = normalizeEmail(email);
      if (!isValidEmail(normalizedEmail)) {
        throw createGraphQLError("The email is not valid");
      }
      const user = await User.findOne({ email: normalizedEmail, active: true }).lean();
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
        ...(existing.acl || []).filter(
          (entry) => toComparableId(entry.userId) !== targetUserId
        ),
        {
          userId: targetUserId,
          accessLevel: normalizedAccessLevel,
          grantedBy: context.user._id,
          grantedAt: new Date(),
        },
      ]);

      const updated = await Dashboard.findOneAndUpdate(
        { _id },
        { $set: { acl: nextAcl } },
        { new: true, runValidators: true }
      ).lean();
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
        (entry) => toComparableId(entry.userId) !== targetUserId
      );

      const updated = await Dashboard.findOneAndUpdate(
        { _id },
        { $set: { acl: nextAcl } },
        { new: true, runValidators: true }
      ).lean();
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

    transferDashboardOwnership: async (
      parent,
      { _id, newOwnerUserId },
      context
    ) => {
      ensureThatUserHasRole(context, ["editor", "admin"]);
      const existing = await getDashboardOrNotFound(_id);
      ensureDashboardOwnershipTransferAllowed(existing, context);

      const nextOwner = await User.findOne({
        _id: newOwnerUserId,
        active: true,
      }).lean();
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
          return (
            entryUserId !== currentOwnerUserId && entryUserId !== targetOwnerUserId
          );
        }),
        {
          userId: currentOwnerUserId,
          accessLevel: "editor",
          grantedBy: context.user._id,
          grantedAt: new Date(),
        },
      ]);

      const updated = await Dashboard.findOneAndUpdate(
        { _id },
        {
          $set: {
            user: targetOwnerUserId,
            acl: nextAcl,
          },
        },
        { new: true, runValidators: true }
      ).lean();
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

        const dashboard = await Dashboard.findOne({ _id: args._id }).lean();
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
