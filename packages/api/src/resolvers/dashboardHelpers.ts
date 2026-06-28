/**
 * @module resolvers/dashboardHelpers
 * Shared dashboard resolver helper logic for policy, ACL, and datasource validation.
 */

import crypto from "node:crypto";
import { createGraphQLError } from "graphql-yoga";
import {
  collectDatasourceManifestIssues,
  validateDashboardDocument,
} from "@freeboard/core/validate.js";
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
const credentialProfileRepository = dataStore.repositories.credentialProfiles;
const brokerProfileRepository = dataStore.repositories.brokerProfiles;

// Using a stored credential/broker profile is a trusted-author privilege, gated
// on the same global tier the profile catalog itself is gated on.
const TRUSTED_PROFILE_AUTHOR_ROLES = new Set(["editor", "admin"]);

/**
 * Whether the principal may use any credential/broker profile (a global
 * `editor`/`admin`). The single source of truth shared by the write-time author
 * gate (`assertCredentialAuthorAuthorized`) and the `dashboardUsableProfiles`
 * picker, so the set offered for selection always matches the set a save permits.
 */
export const isTrustedProfileAuthor = (context: ApiContext): boolean =>
  TRUSTED_PROFILE_AUTHOR_ROLES.has(String(context.user?.role || ""));

const EXTERNALLY_VISIBLE_DASHBOARD_VISIBILITIES = new Set(["link", "public"]);

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
  // Per-type settings validation is owned by @freeboard/core's manifest (the
  // single source of truth). Validate each datasource fully (structural guard,
  // then settings) before the next, so the first thrown message matches the old
  // in-order fail-fast contract. The structural guard stays here because this
  // shim runs on RAW input, before the core document validator's Ajv pass.
  datasources.forEach((datasource, index) => {
    if (!datasource || typeof datasource !== "object" || Array.isArray(datasource)) {
      throw createBadInputError(`Dashboard datasource at index ${index} must be an object`);
    }
    const [first] = collectDatasourceManifestIssues([datasource]);
    if (first) {
      throw createBadInputError(first.message);
    }
  });
};

/** Stable (key-sorted, deep) serialization so benign key reordering is not seen as a change. */
const stableSerialize = (value: unknown): string => {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value) ?? "null";
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableSerialize).join(",")}]`;
  }
  const record = value as UnknownRecord;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableSerialize(record[key])}`)
    .join(",")}}`;
};

/** The credential/broker profile ids a datasource references (trimmed, non-empty). */
const referencedProfileIds = (datasource: unknown): string[] => {
  const settings = asRecord(asRecord(datasource).settings);
  const ids: string[] = [];
  for (const key of ["credentialProfileId", "brokerProfileId"]) {
    const value = settings[key];
    if (typeof value === "string" && value.trim()) {
      ids.push(value.trim());
    }
  }
  return ids;
};

/**
 * Author-trust gate for credential/broker references (issue #213).
 *
 * Using a stored credential/broker profile is a *trusted-author* privilege — the
 * same tier the profile catalog is gated on (global `editor`/`admin`). An ACL-only
 * editor (a global viewer holding a per-dashboard edit grant) is NOT trusted to
 * attach a secret to settings they control: the authenticated datasource gateway
 * flow injects the referenced secret into the author-controlled URL without an
 * `allowPublicUse` check, so adding or redirecting such a datasource would let an
 * untrusted author exfiltrate the secret. An untrusted author may therefore only
 * add/modify datasources that reference `allowPublicUse` (public) profiles; a
 * pre-existing datasource left byte-identical is allowed, so a non-editor can still
 * edit a shared board that already uses the owner's key without being able to
 * re-target it.
 *
 * Pure: the caller resolves `isNonPublicProfileId` from the profile store and only
 * invokes this for untrusted authors (trusted authors skip it entirely).
 */
export const collectUntrustedCredentialAuthorIssues = ({
  nextDatasources,
  priorDatasources,
  isNonPublicProfileId,
}: {
  nextDatasources: unknown;
  priorDatasources: unknown;
  isNonPublicProfileId: (profileId: string) => boolean;
}): string[] => {
  if (!Array.isArray(nextDatasources)) {
    return [];
  }
  const priorById = new Map<string, string>();
  if (Array.isArray(priorDatasources)) {
    for (const datasource of priorDatasources) {
      const id = toComparableId(asRecord(datasource).id);
      if (id) {
        priorById.set(id, stableSerialize(datasource));
      }
    }
  }

  const issues: string[] = [];
  nextDatasources.forEach((datasource, index) => {
    const usesNonPublicProfile = referencedProfileIds(datasource).some(isNonPublicProfileId);
    if (!usesNonPublicProfile) {
      return;
    }
    const id = toComparableId(asRecord(datasource).id);
    const unchanged = id !== null && priorById.get(id) === stableSerialize(datasource);
    if (!unchanged) {
      issues.push(
        `Datasource at index ${index} references a credential or broker profile you are not permitted to use; only profiles marked for public use can be added by a non-editor.`,
      );
    }
  });
  return issues;
};

/** Distinct, trimmed ids referenced under a settings key across all datasources. */
const collectReferencedSettingIds = (datasources: unknown, key: string): string[] => {
  if (!Array.isArray(datasources)) {
    return [];
  }
  const ids = new Set<string>();
  for (const datasource of datasources) {
    const value = asRecord(asRecord(datasource).settings)[key];
    if (typeof value === "string" && value.trim()) {
      ids.add(value.trim());
    }
  }
  return [...ids];
};

/**
 * Enforce the author-trust gate (issue #213) on a dashboard write. Trusted authors
 * (global `editor`/`admin`) may use any profile and skip the check (and its lookups).
 * For an untrusted author (an ACL-only editor — a global viewer with a per-dashboard
 * grant), resolve which referenced profiles are non-public and reject any datasource
 * that newly adds or modifies a reference to one. Throws `FORBIDDEN` on the first.
 */
export const assertCredentialAuthorAuthorized = async ({
  nextDatasources,
  priorDatasources,
  context,
}: {
  nextDatasources: unknown;
  priorDatasources: unknown;
  context: ApiContext;
}): Promise<void> => {
  if (isTrustedProfileAuthor(context)) {
    return;
  }
  if (!Array.isArray(nextDatasources)) {
    return;
  }

  // An id resolves to "public" only when its stored record exists and is flagged
  // `allowPublicUse`; missing/unknown ids stay non-public (fail closed).
  const publicById = new Map<string, boolean>();
  await Promise.all([
    ...collectReferencedSettingIds(nextDatasources, "credentialProfileId").map(
      async (profileId) => {
        const profile = await credentialProfileRepository.findById({ profileId });
        publicById.set(profileId, profile?.allowPublicUse === true);
      },
    ),
    ...collectReferencedSettingIds(nextDatasources, "brokerProfileId").map(async (profileId) => {
      const profile = await brokerProfileRepository.findById({ profileId });
      publicById.set(profileId, profile?.allowPublicUse === true);
    }),
  ]);

  const [issue] = collectUntrustedCredentialAuthorIssues({
    nextDatasources,
    priorDatasources,
    isNonPublicProfileId: (profileId) => publicById.get(profileId) !== true,
  });
  if (issue) {
    throw createGraphQLError(issue, { extensions: { code: "FORBIDDEN" } });
  }
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
  if (!authPolicy.nonAdminCanPublish) {
    throw createGraphQLError("Only administrators can publish dashboards", {
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
    !authPolicy.nonAdminCanPublish
  ) {
    if (hasVisibility) {
      throw createGraphQLError("Only administrators can publish dashboards", {
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
