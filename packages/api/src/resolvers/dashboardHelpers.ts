/**
 * @module resolvers/dashboardHelpers
 * @description Shared dashboard resolver helper logic for policy, ACL, and datasource validation.
 */

import crypto from "node:crypto";
import { createGraphQLError } from "graphql-yoga";
import Dashboard from "../models/Dashboard.js";
import User from "../models/User.js";
import { getAuthPolicyState } from "../policyStore.js";
import { normalizeDashboardAccessLevel, normalizeDashboardVisibility } from "../policy.js";
import { transformDashboard } from "./merge.js";
import { recordShareTokenRevocationEvent } from "../shareTokenRevocationFeed.js";

const DASHBOARD_MUTABLE_FIELDS = new Set([
  "title",
  "version",
  "visibility",
  "image",
  "datasources",
  "columns",
  "width",
  "panes",
  "settings",
]);

const EXTERNALLY_VISIBLE_DASHBOARD_VISIBILITIES = new Set(["link", "public"]);
const ALLOWED_DATASOURCE_TYPES = new Set(["http", "clock", "static", "sse", "websocket", "mqtt"]);
const ALLOWED_HTTP_METHODS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE"]);
const ALLOWED_HTTP_PARSERS = new Set(["json", "text", "csv"]);
const ALLOWED_STREAM_PARSERS = new Set(["json", "text"]);
const ALLOWED_STREAM_AUTH_PLACEMENTS = new Set(["header", "query"]);

export type SanitizedDashboardInput = {
  title?: unknown;
  version?: unknown;
  visibility?: unknown;
  image?: unknown;
  datasources?: unknown;
  columns?: unknown;
  width?: unknown;
  panes?: unknown;
  settings?: unknown;
  shareToken?: unknown;
  shareTokenVersion?: unknown;
};

export const generateShareToken = () => crypto.randomBytes(24).toString("base64url");

export const toComparableId = (value) => {
  if (!value) {
    return null;
  }
  if (typeof value?.toString === "function") {
    return value.toString();
  }
  return String(value);
};

export const getDashboardVisibility = (dashboard) => {
  if (typeof dashboard?.visibility === "string") {
    try {
      return normalizeDashboardVisibility(dashboard.visibility);
    } catch {
      // fall through to default
    }
  }
  return "private";
};

const toTrimmedString = (value) => (typeof value === "string" ? value.trim() : "");

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
    normalizeResourceList(settings.resources).length > 0,
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
        widget?.settings && typeof widget.settings === "object" ? widget.settings : {};
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
          signatures.push(`base:${widgetKey}:${script}:${JSON.stringify(resources)}`);
        }
      }
    });
  });

  signatures.sort();
  return signatures;
};

export const ensureDashboardPayloadAllowedByExecutionMode = async ({
  inputDashboard,
  existingDashboard = null,
}) => {
  if (!inputDashboard || typeof inputDashboard !== "object") {
    return;
  }

  const hasTrustedSettingsInInput =
    Object.prototype.hasOwnProperty.call(inputDashboard, "settings") &&
    hasTrustedDashboardSettings(inputDashboard.settings);
  const inputTrustedWidgetSignatures = Object.prototype.hasOwnProperty.call(inputDashboard, "panes")
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
      throw createGraphQLError("Trusted dashboard settings require execution mode 'trusted'", {
        extensions: { code: "FORBIDDEN" },
      });
    }
  }

  if (Object.prototype.hasOwnProperty.call(inputDashboard, "panes")) {
    if (inputTrustedWidgetSignatures.length > 0) {
      const existingTrustedWidgetSignatures = trustedWidgetPayloadSignatures(
        existingDashboard?.panes,
      );
      if (
        JSON.stringify(inputTrustedWidgetSignatures) !==
        JSON.stringify(existingTrustedWidgetSignatures)
      ) {
        throw createGraphQLError("Trusted widget capabilities require execution mode 'trusted'", {
          extensions: { code: "FORBIDDEN" },
        });
      }
    }
  }
};

export const sanitizeDashboardInput = (dashboard: Record<string, unknown> = {}) => {
  const sanitized: SanitizedDashboardInput = {};
  for (const [key, value] of Object.entries(dashboard || {})) {
    if (DASHBOARD_MUTABLE_FIELDS.has(key)) {
      (sanitized as Record<string, unknown>)[key] = value;
    }
  }
  return sanitized;
};

const createBadInputError = (message) =>
  createGraphQLError(message, {
    extensions: { code: "BAD_USER_INPUT" },
  });

export const validateDashboardDatasources = (datasources) => {
  if (datasources === undefined) {
    return;
  }

  if (!Array.isArray(datasources)) {
    throw createBadInputError("Dashboard datasources must be an array");
  }

  datasources.forEach((datasource, index) => {
    if (!datasource || typeof datasource !== "object" || Array.isArray(datasource)) {
      throw createBadInputError(`Dashboard datasource at index ${index} must be an object`);
    }

    const type = String(datasource.type || "")
      .trim()
      .toLowerCase();
    if (!ALLOWED_DATASOURCE_TYPES.has(type)) {
      throw createBadInputError(
        `Datasource type '${type || "unknown"}' is not supported. Allowed: http, clock, static, sse, websocket, mqtt.`,
      );
    }

    const settings =
      datasource.settings &&
      typeof datasource.settings === "object" &&
      !Array.isArray(datasource.settings)
        ? datasource.settings
        : {};

    if (type === "http") {
      const targetUrl = String(settings.url || "").trim();
      if (!targetUrl) {
        throw createBadInputError(
          `HTTP datasource at index ${index} requires a non-empty settings.url`,
        );
      }

      if (
        settings.method !== undefined &&
        settings.method !== null &&
        !ALLOWED_HTTP_METHODS.has(String(settings.method).trim().toUpperCase())
      ) {
        throw createBadInputError(`HTTP datasource at index ${index} uses an unsupported method`);
      }

      if (
        settings.parser !== undefined &&
        settings.parser !== null &&
        !ALLOWED_HTTP_PARSERS.has(String(settings.parser).trim().toLowerCase())
      ) {
        throw createBadInputError(`HTTP datasource at index ${index} uses an unsupported parser`);
      }

      if (
        settings.credentialProfileId !== undefined &&
        settings.credentialProfileId !== null &&
        String(settings.credentialProfileId).trim() === ""
      ) {
        throw createBadInputError(
          `HTTP datasource at index ${index} has an invalid credentialProfileId`,
        );
      }
      return;
    }

    if (type === "sse" || type === "websocket") {
      const targetUrl = String(settings.url || "").trim();
      if (!targetUrl) {
        throw createBadInputError(
          `${type.toUpperCase()} datasource at index ${index} requires a non-empty settings.url`,
        );
      }

      if (
        settings.parser !== undefined &&
        settings.parser !== null &&
        !ALLOWED_STREAM_PARSERS.has(String(settings.parser).trim().toLowerCase())
      ) {
        throw createBadInputError(
          `${type.toUpperCase()} datasource at index ${index} uses an unsupported parser`,
        );
      }

      if (
        settings.authPlacement !== undefined &&
        settings.authPlacement !== null &&
        !ALLOWED_STREAM_AUTH_PLACEMENTS.has(String(settings.authPlacement).trim().toLowerCase())
      ) {
        throw createBadInputError(
          `${type.toUpperCase()} datasource at index ${index} uses an unsupported authPlacement`,
        );
      }

      if (
        String(settings.authPlacement || "header")
          .trim()
          .toLowerCase() === "query" &&
        String(settings.queryParamName || "").trim() === ""
      ) {
        throw createBadInputError(
          `${type.toUpperCase()} datasource at index ${index} requires settings.queryParamName for query auth placement`,
        );
      }

      if (
        settings.credentialProfileId !== undefined &&
        settings.credentialProfileId !== null &&
        String(settings.credentialProfileId).trim() === ""
      ) {
        throw createBadInputError(
          `${type.toUpperCase()} datasource at index ${index} has an invalid credentialProfileId`,
        );
      }

      if (type === "websocket" && settings.protocols !== undefined) {
        const isStringProtocols = typeof settings.protocols === "string";
        const isArrayProtocols = Array.isArray(settings.protocols);
        if (!isStringProtocols && !isArrayProtocols) {
          throw createBadInputError(
            `WEBSOCKET datasource at index ${index} requires settings.protocols to be a comma-separated string or string array`,
          );
        }
      }
      return;
    }

    if (type === "mqtt") {
      if (String(settings.brokerProfileId || "").trim() === "") {
        throw createBadInputError(
          `MQTT datasource at index ${index} requires a non-empty settings.brokerProfileId`,
        );
      }
      if (String(settings.topic || "").trim() === "") {
        throw createBadInputError(
          `MQTT datasource at index ${index} requires a non-empty settings.topic`,
        );
      }

      if (
        settings.parser !== undefined &&
        settings.parser !== null &&
        !ALLOWED_STREAM_PARSERS.has(String(settings.parser).trim().toLowerCase())
      ) {
        throw createBadInputError(`MQTT datasource at index ${index} uses an unsupported parser`);
      }

      if (settings.qos !== undefined && settings.qos !== null) {
        const qos = Number(settings.qos);
        if (!Number.isFinite(qos) || qos < 0 || qos > 1) {
          throw createBadInputError(
            `MQTT datasource at index ${index} requires settings.qos between 0 and 1`,
          );
        }
      }

      if (settings.keepaliveSeconds !== undefined && settings.keepaliveSeconds !== null) {
        const keepaliveSeconds = Number(settings.keepaliveSeconds);
        if (!Number.isFinite(keepaliveSeconds) || keepaliveSeconds < 5 || keepaliveSeconds > 3600) {
          throw createBadInputError(
            `MQTT datasource at index ${index} requires settings.keepaliveSeconds between 5 and 3600`,
          );
        }
      }
      return;
    }

    // clock/static are validated by plugin/runtime contracts only.
  });
};

const getAclEntry = (dashboard, userId) => {
  const normalizedUserId = toComparableId(userId);
  if (!normalizedUserId || !Array.isArray(dashboard?.acl)) {
    return null;
  }
  return dashboard.acl.find((entry) => toComparableId(entry?.userId) === normalizedUserId) || null;
};

export const resolveDashboardPermissions = (
  dashboard,
  context,
  { shareTokenMatched = false } = {},
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

export const transformDashboardForContext = (dashboard, context, permissions) =>
  transformDashboard(dashboard, context.user?._id || null, {
    canEdit: permissions.canEdit,
    canManageSharing: permissions.canManageSharing,
  });

export const getDashboardOrNotFound = async (_id) => {
  const dashboard = await Dashboard.findOne({ _id }).lean();
  if (!dashboard) {
    throw createGraphQLError("Dashboard not found");
  }
  return dashboard;
};

export const ensureDashboardReadable = (dashboard, context, options = {}) => {
  const permissions = resolveDashboardPermissions(dashboard, context, options);
  if (!permissions.canRead) {
    throw createGraphQLError("Dashboard not found");
  }
  return permissions;
};

export const ensureDashboardEditable = (dashboard, context) => {
  const permissions = resolveDashboardPermissions(dashboard, context);
  if (!permissions.canEdit) {
    throw createGraphQLError("Dashboard not found");
  }
  return permissions;
};

export const ensureDashboardShareManageable = (dashboard, context) => {
  const permissions = resolveDashboardPermissions(dashboard, context);
  if (!permissions.canManageSharing) {
    throw createGraphQLError("Dashboard not found");
  }
  return permissions;
};

export const ensureDashboardOwnershipTransferAllowed = (dashboard, context) => {
  const permissions = resolveDashboardPermissions(dashboard, context);
  if (!(permissions.isOwner || context.user?.role === "admin")) {
    throw createGraphQLError("Dashboard not found");
  }
  return permissions;
};

export const ensureDashboardDeletable = (dashboard, context) => {
  const permissions = resolveDashboardPermissions(dashboard, context);
  if (!permissions.canDelete) {
    throw createGraphQLError("Dashboard not found");
  }
  return permissions;
};

export const ensureVisibilityTransitionAllowed = async ({
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

export const resolveCreateVisibility = async (inputDashboard, context) => {
  const hasVisibility = Object.prototype.hasOwnProperty.call(inputDashboard || {}, "visibility");
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

export const uniqueAclEntries = (entries = []) => {
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

export const buildCollaboratorView = async (dashboard) => {
  const ownerUserId = toComparableId(dashboard.user);
  const aclEntries = uniqueAclEntries(dashboard.acl || []);
  const userIds = [ownerUserId, ...aclEntries.map((entry) => toComparableId(entry.userId))].filter(
    Boolean,
  );

  const users = await User.find({ _id: { $in: userIds } })
    .select("_id email")
    .lean();
  const emailByUserId = new Map(users.map((user) => [toComparableId(user._id), user.email]));

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

export const recordShareTokenRevocation = async ({ dashboardId, shareTokenVersion }) => {
  const normalizedDashboardId = toComparableId(dashboardId);
  const normalizedVersion = Math.floor(Number(shareTokenVersion));
  if (!normalizedDashboardId || !Number.isFinite(normalizedVersion)) {
    return;
  }

  await recordShareTokenRevocationEvent({
    dashboardId: normalizedDashboardId,
    shareTokenVersion: Math.max(0, normalizedVersion),
    revokedAt: new Date(),
  });
};
