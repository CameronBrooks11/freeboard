/**
 * @module resolvers/merge
 * @description Utility to map dashboard documents to GraphQL response objects.
 */

/**
 * Transform a dashboard document into GraphQL response shape.
 *
 * @param {Object} dashboard - Raw dashboard document.
 * @param {string|null} [viewerUserId=null] - Current user id.
 * @param {Object} [permissions={}] - Effective permission flags.
 * @param {boolean} [permissions.canEdit=false]
 * @param {boolean} [permissions.canManageSharing=false]
 * @returns {Object}
 */
export const transformDashboard = (
  dashboard,
  viewerUserId = null,
  permissions = {}
) => {
  const rawOwnerId =
    dashboard?.user && typeof dashboard.user === "object" && "_id" in dashboard.user
      ? dashboard.user._id
      : dashboard.user;
  const ownerId =
    typeof rawOwnerId?.toString === "function" ? rawOwnerId.toString() : rawOwnerId;
  const currentUserId =
    typeof viewerUserId?.toString === "function"
      ? viewerUserId.toString()
      : viewerUserId;
  const isOwner = Boolean(currentUserId && ownerId === currentUserId);
  const canEdit = permissions.canEdit === true;
  const canManageSharing = permissions.canManageSharing === true;

  return {
    _id: dashboard._id.toString(),
    version: dashboard.version,
    title: dashboard.title,
    visibility: dashboard.visibility || "private",
    shareToken: canManageSharing ? dashboard.shareToken || null : null,
    image: dashboard.image,
    datasources: dashboard.datasources,
    columns: dashboard.columns,
    panes: dashboard.panes,
    width: dashboard.width,
    authProviders: dashboard.authProviders,
    settings: dashboard.settings,
    user: ownerId,
    acl: Array.isArray(dashboard.acl)
      ? dashboard.acl.map((entry) => ({
          userId: entry.userId,
          accessLevel: entry.accessLevel,
        }))
      : [],
    isOwner,
    canEdit,
    canManageSharing,
    createdAt: dashboard.createdAt,
    updatedAt: dashboard.updatedAt,
  };
};
