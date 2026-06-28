/**
 * @module resolvers/dashboardHelpers
 * Shared dashboard resolver helper logic for policy, ACL, and datasource validation.
 */

import crypto from "node:crypto";
import { createGraphQLError } from "graphql-yoga";
import { validateDashboardDocument } from "@freeboard/core/validate.js";
import { dataStore } from "../data/index.js";
import type { DashboardAclEntryRecord, DashboardRecord } from "../data/contracts.js";
import type { ValidationResult } from "@freeboard/core";
import { getAuthPolicyState } from "../policyStore.js";
import { normalizeDashboardAccessLevel, normalizeDashboardVisibility } from "../policy.js";
import { transformDashboard } from "./merge.js";
import { recordShareTokenRevocationEvent } from "../shareTokenRevocationFeed.js";
import type { ApiContext } from "../context.js";

type UnknownRecord = Record<string, unknown>;
type DashboardLike = UnknownRecord & {
  _id?: unknown;
  user?: unknown;
  visibility?: unknown;
  shareToken?: unknown;
  shareTokenVersion?: unknown;
  document?: UnknownRecord;
  acl?: DashboardAclEntryRecord[];
};

/** Coerce an arbitrary value to a plain object record (non-objects become `{}`). */
const asRecord = (value: unknown): UnknownRecord =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as UnknownRecord) : {};
type DashboardPermissions = {
  canRead: boolean;
  canEdit: boolean;
  canManageSharing: boolean;
  canDelete: boolean;
  isOwner: boolean;
};
const dashboardRepository = dataStore.repositories.dashboards;
const userRepository = dataStore.repositories.users;

const EXTERNALLY_VISIBLE_DASHBOARD_VISIBILITIES = new Set(["link", "public"]);
const ALLOWED_DATASOURCE_TYPES = new Set(["http", "clock", "static", "sse", "websocket", "mqtt"]);
const ALLOWED_HTTP_METHODS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE"]);
const ALLOWED_HTTP_PARSERS = new Set(["json", "text", "csv"]);
const ALLOWED_STREAM_PARSERS = new Set(["json", "text"]);
const ALLOWED_STREAM_AUTH_PLACEMENTS = new Set(["header", "query"]);

export type SanitizedDashboardInput = {
  document?: unknown;
  visibility?: unknown;
  shareToken?: unknown;
  shareTokenVersion?: unknown;
};

export const generateShareToken = () => crypto.randomBytes(24).toString("base64url");

export const toComparableId = (value: unknown): string | null => {
  if (!value) {
    return null;
  }
  if (typeof value?.toString === "function") {
    return value.toString();
  }
  return String(value);
};

const toDate = (value: unknown, fallback = new Date()): Date => {
  if (value instanceof Date && Number.isFinite(value.getTime())) {
    return value;
  }
  const normalized = new Date(value as Date | string | number);
  if (!Number.isFinite(normalized.getTime())) {
    return fallback;
  }
  return normalized;
};

export const getDashboardVisibility = (dashboard: DashboardLike): string => {
  if (typeof dashboard?.visibility === "string") {
    try {
      return normalizeDashboardVisibility(dashboard.visibility);
    } catch {
      // fall through to default
    }
  }
  return "private";
};

const toTrimmedString = (value: unknown): string => (typeof value === "string" ? value.trim() : "");

const normalizeResourceList = (resources: unknown): string[] => {
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

const hasTrustedDashboardSettings = (settings: unknown): boolean => {
  if (!settings || typeof settings !== "object") {
    return false;
  }
  const settingsRecord = settings as UnknownRecord;
  return Boolean(
    toTrimmedString(settingsRecord.script) ||
    toTrimmedString(settingsRecord.style) ||
    normalizeResourceList(settingsRecord.resources).length > 0,
  );
};

const trustedDashboardSettingsSignature = (settings: unknown) => {
  const settingsRecord =
    settings && typeof settings === "object" ? (settings as UnknownRecord) : {};
  return JSON.stringify({
    script: toTrimmedString(settingsRecord.script),
    style: toTrimmedString(settingsRecord.style),
    resources: normalizeResourceList(settingsRecord.resources),
  });
};

const normalizeWidgetType = (widget: UnknownRecord | null | undefined): string =>
  String(widget?.typeName || widget?.type || "")
    .trim()
    .toLowerCase();

const trustedWidgetPayloadSignatures = (panes: unknown): string[] => {
  if (!Array.isArray(panes)) {
    return [];
  }

  const signatures: string[] = [];
  panes.forEach((pane, paneIndex) => {
    const paneRecord = pane && typeof pane === "object" ? (pane as UnknownRecord) : {};
    const widgets: unknown[] = Array.isArray(paneRecord.widgets) ? paneRecord.widgets : [];
    widgets.forEach((widget: unknown, widgetIndex: number) => {
      const widgetRecord =
        widget && typeof widget === "object" ? (widget as UnknownRecord) : ({} as UnknownRecord);
      const widgetType = normalizeWidgetType(widgetRecord);
      const widgetSettings =
        widgetRecord.settings && typeof widgetRecord.settings === "object"
          ? (widgetRecord.settings as UnknownRecord)
          : {};
      const widgetKey = toTrimmedString(widgetRecord.id) || `${paneIndex}:${widgetIndex}`;

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
}: {
  inputDashboard: UnknownRecord | null;
  existingDashboard?: DashboardLike | null;
}) => {
  if (!inputDashboard || typeof inputDashboard !== "object") {
    return;
  }

  // Envelope-only mutations carry no document, so there is no content to gate.
  if (!Object.prototype.hasOwnProperty.call(inputDashboard, "document")) {
    return;
  }

  const inputContent = asRecord(inputDashboard.document);
  const existingContent = asRecord(existingDashboard?.document);

  const hasTrustedSettingsInInput = hasTrustedDashboardSettings(inputContent.settings);
  const inputTrustedWidgetSignatures = trustedWidgetPayloadSignatures(inputContent.panes);

  if (!hasTrustedSettingsInInput && inputTrustedWidgetSignatures.length === 0) {
    return;
  }

  const authPolicy = await getAuthPolicyState();
  if (authPolicy.executionMode === "trusted") {
    return;
  }

  if (
    hasTrustedSettingsInInput &&
    trustedDashboardSettingsSignature(inputContent.settings) !==
      trustedDashboardSettingsSignature(existingContent.settings)
  ) {
    throw createGraphQLError("Trusted dashboard settings require execution mode 'trusted'", {
      extensions: { code: "FORBIDDEN" },
    });
  }

  if (inputTrustedWidgetSignatures.length > 0) {
    const existingTrustedWidgetSignatures = trustedWidgetPayloadSignatures(existingContent.panes);
    if (
      JSON.stringify(inputTrustedWidgetSignatures) !==
      JSON.stringify(existingTrustedWidgetSignatures)
    ) {
      throw createGraphQLError("Trusted widget capabilities require execution mode 'trusted'", {
        extensions: { code: "FORBIDDEN" },
      });
    }
  }
};

export const sanitizeDashboardInput = (
  dashboard: Record<string, unknown> = {},
): SanitizedDashboardInput => {
  const sanitized: SanitizedDashboardInput = {};
  if (Object.prototype.hasOwnProperty.call(dashboard, "document")) {
    sanitized.document = dashboard.document;
  }
  if (Object.prototype.hasOwnProperty.call(dashboard, "visibility")) {
    sanitized.visibility = dashboard.visibility;
  }
  return sanitized;
};

/** The portable datasources carried inside a (sanitized) dashboard input's document. */
export const inputDatasources = (input: SanitizedDashboardInput): unknown =>
  asRecord(input.document).datasources;

const toValidationErrorExtensions = (result: ValidationResult) =>
  result.errors.map((issue) => ({ code: issue.code, path: issue.path, message: issue.message }));

/**
 * Validate a document against the v1 contract and return its canonical form
 * (migrated: envelope keys stripped, schemaVersion stamped, pane ids derived).
 * Throw BAD_USER_INPUT with structured validationErrors when invalid; this
 * canonical value is what gets persisted, so clients cannot smuggle non-schema
 * or server-owned keys into storage. Warnings never block.
 *
 * @param {unknown} candidate
 * @returns {UnknownRecord} The canonical v1 document.
 */
export const assertValidDashboardDocument = (candidate: unknown): UnknownRecord => {
  const result = validateDashboardDocument(candidate);
  if (!result.valid || !result.document) {
    throw createGraphQLError("Dashboard document failed validation", {
      extensions: { code: "BAD_USER_INPUT", validationErrors: toValidationErrorExtensions(result) },
    });
  }
  return result.document;
};

const createBadInputError = (message: string) =>
  createGraphQLError(message, {
    extensions: { code: "BAD_USER_INPUT" },
  });

export const validateDashboardDatasources = (datasources: unknown): void => {
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

const getAclEntry = (dashboard: DashboardLike, userId: unknown) => {
  const normalizedUserId = toComparableId(userId);
  if (!normalizedUserId || !Array.isArray(dashboard?.acl)) {
    return null;
  }
  return dashboard.acl.find((entry) => toComparableId(entry?.userId) === normalizedUserId) || null;
};

export const resolveDashboardPermissions = (
  dashboard: DashboardLike | null | undefined,
  context: ApiContext,
  { shareTokenMatched = false } = {},
): DashboardPermissions => {
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

  // Per-dashboard ACL capabilities (independent of the user's global role,
  // which only gates creating new dashboards): editor and manager can edit the
  // document; only manager can manage sharing/ACL. Deletion and ownership
  // transfer stay with the owner (or an admin).
  const canEdit = isAdmin || isOwner || aclAccessLevel === "editor" || aclAccessLevel === "manager";
  const canManageSharing = isAdmin || isOwner || aclAccessLevel === "manager";
  const canDelete = isAdmin || isOwner;

  return {
    canRead,
    canEdit,
    canManageSharing,
    canDelete,
    isOwner,
  };
};

export const transformDashboardForContext = (
  dashboard: DashboardLike,
  context: ApiContext,
  permissions: DashboardPermissions,
) =>
  transformDashboard(dashboard, context.user?._id || null, {
    canEdit: permissions.canEdit,
    canManageSharing: permissions.canManageSharing,
  });

export const getDashboardOrNotFound = async (_id: unknown): Promise<DashboardRecord> => {
  const dashboard = await dashboardRepository.findById({
    dashboardId: String(_id || "").trim(),
  });
  if (!dashboard) {
    throw createGraphQLError("Dashboard not found");
  }
  return dashboard;
};

export const ensureDashboardReadable = (
  dashboard: DashboardLike,
  context: ApiContext,
  options: { shareTokenMatched?: boolean } = {},
): DashboardPermissions => {
  const permissions = resolveDashboardPermissions(dashboard, context, options);
  if (!permissions.canRead) {
    throw createGraphQLError("Dashboard not found");
  }
  return permissions;
};

export const ensureDashboardEditable = (
  dashboard: DashboardLike,
  context: ApiContext,
): DashboardPermissions => {
  const permissions = resolveDashboardPermissions(dashboard, context);
  if (!permissions.canEdit) {
    throw createGraphQLError("Dashboard not found");
  }
  return permissions;
};

export const ensureDashboardShareManageable = (
  dashboard: DashboardLike,
  context: ApiContext,
): DashboardPermissions => {
  const permissions = resolveDashboardPermissions(dashboard, context);
  if (!permissions.canManageSharing) {
    throw createGraphQLError("Dashboard not found");
  }
  return permissions;
};

export const ensureDashboardOwnershipTransferAllowed = (
  dashboard: DashboardLike,
  context: ApiContext,
): DashboardPermissions => {
  const permissions = resolveDashboardPermissions(dashboard, context);
  if (!(permissions.isOwner || context.user?.role === "admin")) {
    throw createGraphQLError("Dashboard not found");
  }
  return permissions;
};

export const ensureDashboardDeletable = (
  dashboard: DashboardLike,
  context: ApiContext,
): DashboardPermissions => {
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
}: {
  context: ApiContext;
  previousVisibility: string;
  nextVisibility: string;
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

export const resolveCreateVisibility = async (
  inputDashboard: SanitizedDashboardInput,
  context: ApiContext,
): Promise<string> => {
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

export const uniqueAclEntries = (
  entries: Array<{
    userId?: unknown;
    accessLevel?: unknown;
    grantedBy?: unknown;
    grantedAt?: unknown;
  }> = [],
): DashboardAclEntryRecord[] => {
  const byUserId = new Map<string, DashboardAclEntryRecord>();
  entries.forEach((entry) => {
    const userId = toComparableId(entry?.userId);
    if (!userId) {
      return;
    }
    const grantedAt = toDate(entry.grantedAt);
    byUserId.set(userId, {
      userId,
      accessLevel: normalizeDashboardAccessLevel(entry.accessLevel),
      grantedBy: toComparableId(entry.grantedBy) || null,
      grantedAt,
    });
  });
  return [...byUserId.values()];
};

export const buildCollaboratorView = async (dashboard: DashboardLike) => {
  const ownerUserId = toComparableId(dashboard.user);
  const aclEntries = uniqueAclEntries(dashboard.acl || []);
  const userIds = [ownerUserId, ...aclEntries.map((entry) => toComparableId(entry.userId))].filter(
    (entry): entry is string => Boolean(entry),
  );

  const users = await userRepository.findByIds({
    userIds,
  });
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

export const recordShareTokenRevocation = async ({
  dashboardId,
  shareTokenVersion,
}: {
  dashboardId: unknown;
  shareTokenVersion: unknown;
}) => {
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
