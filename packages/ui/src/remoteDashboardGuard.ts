/**
 * @module remoteDashboardGuard
 * @description Decides whether a dashboard result from the server may replace
 *              the document in the editor.
 */

import type { useDashboardStore } from "./stores/dashboard.js";

type DashboardStore = Pick<
  ReturnType<typeof useDashboardStore>,
  "dashboard" | "hasUnsavedChanges" | "noteRemoteUpdatePending" | "noteRemoteEditAccessLost"
>;

/**
 * Return true when `dash` must not be loaded, after surfacing why.
 *
 * Unsaved local edits are never replaced by a remote copy of the same
 * dashboard, whichever path delivers it. A live update arrives twice: once on
 * the subscription, and again on the read query, because the subscription
 * result refreshes the cached dashboard the query watches. A clean editor still
 * takes live updates, and a different dashboard (navigation) still loads.
 */
export function holdRemoteDashboard(
  store: DashboardStore,
  dash: Record<string, unknown> | null | undefined,
  { fromSubscription = false }: { fromSubscription?: boolean } = {},
): boolean {
  // A terminal null on the live stream means the server ended our access
  // (revoked, or the dashboard was deleted). Surface it and leave edit mode;
  // unsaved edits are preserved for the user to reload or export.
  if (dash == null) {
    if (fromSubscription) {
      store.noteRemoteEditAccessLost();
    }
    return fromSubscription;
  }
  if (!store.hasUnsavedChanges || dash._id !== store.dashboard._id) {
    return false;
  }
  // Keep the in-progress document and surface the remote change instead: a
  // save would CONFLICT if the document advanced, and a downgraded canEdit
  // means edit access was revoked.
  if (dash.canEdit === false) {
    store.noteRemoteEditAccessLost();
  } else {
    store.noteRemoteUpdatePending();
  }
  return true;
}
