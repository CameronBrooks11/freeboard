/**
 * @module dashboardSubscription
 * @description Live dashboard updates (SSE) for the dashboard at the current route id.
 */

import { ref, watch } from "vue";
import type { Ref } from "vue";
import { useSubscription } from "@vue/apollo-composable";
import { DASHBOARD_UPDATE_SUBSCRIPTION } from "./gql.js";

/**
 * Subscribe to updates of the dashboard `routeId` while `enabled` is true.
 * Must be called inside a component setup or effect scope.
 */
export function useDashboardSubscription(routeId: Ref<string | undefined>, enabled: Ref<boolean>) {
  // `useSubscription` starts with the variables its own watcher last applied,
  // and on navigation its `enabled` watcher runs first, so a start driven by
  // `enabled` directly sends the previous route's `{ id: undefined }` and then
  // restarts. Mirror `enabled` from a post-flush watcher instead: it runs after
  // the composable's pre-flush watchers have applied the new `id`.
  const subscriptionEnabled = ref(enabled.value);
  watch(
    enabled,
    (value) => {
      subscriptionEnabled.value = value;
    },
    { flush: "post" },
  );

  return useSubscription(DASHBOARD_UPDATE_SUBSCRIPTION, () => ({ id: routeId.value }), {
    context: { apiName: "stream" },
    enabled: subscriptionEnabled,
  });
}
