/**
 * @module auth/publishPolicy
 * @description Helpers for publish-policy aware dashboard payload normalization.
 */

/**
 * Normalize create-dashboard payload based on caller publish capability.
 *
 * @param {Object} input
 * @param {Object} input.dashboard
 * @param {boolean} input.canPublish
 * @returns {Object}
 */
export const normalizeCreateDashboardPayload = ({ dashboard, canPublish }) =>
  canPublish ? dashboard : { ...dashboard, published: false };
