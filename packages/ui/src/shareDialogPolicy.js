/**
 * @module shareDialogPolicy
 * @description Pure helpers for ShareDialog permission gating and payload application.
 */

import { isDashboardShareable } from "./sharePolicy.js";

/**
 * Resolve share-dialog permission flags from dashboard/session state.
 *
 * @param {Object} input
 * @param {boolean} input.isSaved
 * @param {Object|undefined|null} input.dashboard
 * @returns {{isShareableDashboard: boolean, canManageSharing: boolean}}
 */
export const resolveShareDialogPermissions = ({ isSaved, dashboard }) => ({
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
 * @returns {string|null}
 */
export const getShareMutationGuardError = ({
  isShareableDashboard,
  canManageSharing,
}) => {
  if (!isShareableDashboard) {
    return "Save the dashboard before configuring sharing.";
  }
  if (!canManageSharing) {
    return "You do not have permission to manage sharing.";
  }
  return null;
};

/**
 * Validate collaborator input before mutation.
 *
 * @param {Object} input
 * @param {string|undefined|null} input.collaboratorEmail
 * @returns {string|null}
 */
export const getCollaboratorInputError = ({ collaboratorEmail }) => {
  if (!String(collaboratorEmail || "").trim()) {
    return "Collaborator email is required.";
  }
  return null;
};

/**
 * Validate ownership transfer input before mutation.
 *
 * @param {Object} input
 * @param {string|undefined|null} input.transferTargetUserId
 * @returns {string|null}
 */
export const getOwnershipTransferInputError = ({ transferTargetUserId }) => {
  if (!String(transferTargetUserId || "").trim()) {
    return "Select a transfer target first.";
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
export const applyShareMutationPayloadToDashboard = ({ dashboard, payload }) => {
  if (!payload || !dashboard) {
    return false;
  }

  dashboard.visibility = payload.visibility || dashboard.visibility;
  dashboard.shareToken = payload.shareToken || null;

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
