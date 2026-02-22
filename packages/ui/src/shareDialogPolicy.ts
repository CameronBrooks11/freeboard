/**
 * @module shareDialogPolicy
 * @description Pure helpers for ShareDialog permission gating and payload application.
 */

import { isDashboardShareable } from "./sharePolicy.js";
type ShareableDashboard = {
  _id?: string | null;
  visibility?: string | null;
  shareToken?: string | null;
  shareTokenVersion?: number | null;
  canEdit?: boolean;
  canManageSharing?: boolean;
  user?: unknown;
  acl?: unknown[];
};

/**
 * Resolve share-dialog permission flags from dashboard/session state.
 *
 * @param {Object} input
 * @param {boolean} input.isSaved
 * @param {Object|undefined|null} input.dashboard
 * @returns {{isShareableDashboard: boolean, canManageSharing: boolean}}
 */
export const resolveShareDialogPermissions = ({
  isSaved,
  dashboard,
}: {
  isSaved: boolean;
  dashboard: ShareableDashboard | null | undefined;
}) => ({
  isShareableDashboard: isDashboardShareable({
    isSaved,
    dashboardId: dashboard?._id,
  }),
  canManageSharing: Boolean(dashboard?.canManageSharing) || !isSaved,
});

/**
 * Validate generic share mutation preconditions.
 *
 * @param {Object} input
 * @param {boolean} input.isShareableDashboard
 * @param {boolean} input.canManageSharing
 * @returns {string|null} i18n key or null.
 */
export const getShareMutationGuardError = ({
  isShareableDashboard,
  canManageSharing,
}: {
  isShareableDashboard: boolean;
  canManageSharing: boolean;
}): string | null => {
  if (!isShareableDashboard) {
    return "share.unsavedHint";
  }
  if (!canManageSharing) {
    return "share.noPermission";
  }
  return null;
};

/**
 * Validate collaborator input before mutation.
 *
 * @param {Object} input
 * @param {string|undefined|null} input.collaboratorEmail
 * @returns {string|null} i18n key or null.
 */
export const getCollaboratorInputError = ({
  collaboratorEmail,
}: {
  collaboratorEmail: string | null | undefined;
}): string | null => {
  if (!String(collaboratorEmail || "").trim()) {
    return "share.errorCollaboratorEmailRequired";
  }
  return null;
};

/**
 * Validate ownership transfer input before mutation.
 *
 * @param {Object} input
 * @param {string|undefined|null} input.transferTargetUserId
 * @returns {string|null} i18n key or null.
 */
export const getOwnershipTransferInputError = ({
  transferTargetUserId,
}: {
  transferTargetUserId: string | null | undefined;
}): string | null => {
  if (!String(transferTargetUserId || "").trim()) {
    return "share.errorTransferTargetRequired";
  }
  return null;
};

/**
 * Apply dashboard mutation payload to the current dashboard object.
 *
 * @param {Object} input
 * @param {Object|undefined|null} input.dashboard
 * @param {Object|undefined|null} input.payload
 * @returns {boolean} True if payload was applied, otherwise false.
 */
export const applyShareMutationPayloadToDashboard = ({
  dashboard,
  payload,
}: {
  dashboard: ShareableDashboard | null | undefined;
  payload: Record<string, unknown> | null | undefined;
}): boolean => {
  if (!payload || !dashboard) {
    return false;
  }

  if (payload.visibility !== undefined) {
    dashboard.visibility = String(payload.visibility || dashboard.visibility || "");
  }
  if (payload.shareToken !== undefined) {
    dashboard.shareToken = payload.shareToken ? String(payload.shareToken) : null;
  }
  if (payload.shareTokenVersion !== undefined) {
    dashboard.shareTokenVersion = Number.isFinite(Number(payload.shareTokenVersion))
      ? Math.max(0, Math.floor(Number(payload.shareTokenVersion)))
      : (dashboard.shareTokenVersion ?? null);
  }

  if (payload.canEdit !== undefined) {
    dashboard.canEdit = Boolean(payload.canEdit);
  }
  if (payload.canManageSharing !== undefined) {
    dashboard.canManageSharing = Boolean(payload.canManageSharing);
  }
  if (payload.user !== undefined) {
    dashboard.user = payload.user;
  }
  if (Array.isArray(payload.acl)) {
    dashboard.acl = payload.acl;
  }
  return true;
};
