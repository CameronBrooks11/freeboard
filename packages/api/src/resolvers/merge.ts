/**
 * @module resolvers/merge
 * Utility to map dashboard documents to GraphQL response objects.
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
  dashboard: Record<string, unknown>,
  viewerUserId: unknown = null,
  permissions: { canEdit?: boolean; canManageSharing?: boolean } = {},
) => {
  const dashboardId = String(dashboard._id || "");
  const rawOwnerId =
    dashboard?.user && typeof dashboard.user === "object" && "_id" in dashboard.user
      ? dashboard.user._id
      : dashboard.user;
  const ownerId = typeof rawOwnerId?.toString === "function" ? rawOwnerId.toString() : rawOwnerId;
  const currentUserId =
    typeof viewerUserId?.toString === "function" ? viewerUserId.toString() : viewerUserId;
  const isOwner = Boolean(currentUserId && ownerId === currentUserId);
  const canEdit = permissions.canEdit === true;
  const canManageSharing = permissions.canManageSharing === true;

  const documentRecord =
    dashboard.document && typeof dashboard.document === "object"
      ? (dashboard.document as Record<string, unknown>)
      : {};

  return {
    _id: dashboardId,
    // Derived convenience projection for list/summary views, so the picker need
    // not fetch the whole document just to render a name.
    title: typeof documentRecord.title === "string" ? documentRecord.title : null,
    visibility: dashboard.visibility || "private",
    shareToken: canManageSharing ? dashboard.shareToken || null : null,
    shareTokenVersion: Number.isFinite(Number(dashboard.shareTokenVersion))
      ? Math.max(0, Math.floor(Number(dashboard.shareTokenVersion)))
      : 0,
    document: dashboard.document,
    documentRevision: Number.isFinite(Number(dashboard.documentRevision))
      ? Math.max(1, Math.floor(Number(dashboard.documentRevision)))
      : 1,
    user: ownerId,
    // ACL membership (collaborator user ids) is only for those who can manage
    // sharing. Readers — including anonymous viewers of a public board — must not
    // receive it; detailed collaborator info is served by `dashboardCollaborators`.
    acl:
      canManageSharing && Array.isArray(dashboard.acl)
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
