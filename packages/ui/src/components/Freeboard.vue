<script setup lang="js">
/**
 * @component Freeboard
 * @description Root component that initializes plugins, fetches/subscribes to dashboard data,
 *              and renders header + board. Reacts to route `/:id` changes without remounting.
 *
 * @prop {string} id - Optional dashboard ID to load (provided by vue-router via props).
 */
defineOptions({ name: 'Freeboard' });

import { reactive, ref, watch, computed } from "vue";
import Header from "./Header.vue";
import Board from "./Board.vue";
import { useFreeboardStore } from "../stores/freeboard";
import { useQuery, useSubscription } from "@vue/apollo-composable";
import { DASHBOARD_READ_QUERY, DASHBOARD_UPDATE_SUBSCRIPTION } from "../gql";
import router from "../router";
import { storeToRefs } from "pinia";
import Preloader from "./Preloader.vue";
import { ClockDatasource } from "../datasources/ClockDatasource";
import { JSONDatasource } from "../datasources/JSONDatasource";
import { HeaderAuthProvider } from "../auth/HeaderAuthProvider";
import { OAuth2PasswordGrantProvider } from "../auth/OAuth2PasswordGrantProvider";
import { usePreferredColorScheme } from "@vueuse/core";
import { BaseWidget } from "../widgets/BaseWidget";

// ----------------------------------------------------------------------------
// Store & theming
// ----------------------------------------------------------------------------
const freeboardStore = useFreeboardStore();
const { showLoadingIndicator, isEditing, isSaved, dashboard } =
  storeToRefs(freeboardStore);

// React to system color scheme changes
const cssClass = usePreferredColorScheme();
watch(cssClass, () => freeboardStore.loadDashboardTheme(), { immediate: true });

// ----------------------------------------------------------------------------
// Props & reactive route id
// ----------------------------------------------------------------------------
const props = defineProps({ id: String });
/** Reactive route id derived from props so it updates on `/:id` navigation. */
const routeId = computed(() => props.id || undefined);
/** Enable GraphQL only when there is an id. */
const queryEnabled = computed(() => !!routeId.value);

// ----------------------------------------------------------------------------
// GraphQL: initial query (reactive variables) + live updates (SSE)
// ----------------------------------------------------------------------------
/**
 * Query initial dashboard data. Variables and `enabled` are reactive so this
 * re-runs when the route `id` changes.
 */
const { result, loading, error } = useQuery(
  DASHBOARD_READ_QUERY,
  () => ({ id: routeId.value }),
  { enabled: queryEnabled, fetchPolicy: "network-only" }
);

/**
 * Subscribe to dashboard updates (SSE). Also reactive to the current `id`.
 */
const { onResult: onSubResult } = useSubscription(
  DASHBOARD_UPDATE_SUBSCRIPTION,
  () => ({ id: routeId.value }),
  { context: { apiName: "stream" }, enabled: queryEnabled }
);

// Redirect to home on query error (e.g., not found/unauthorized)
watch(error, () => router.push("/"));

// Show loader while query is in flight
watch(loading, (l) => { showLoadingIndicator.value = l; });

// Show loader when the route id changes (before the query returns)
watch(routeId, (id) => {
  if (id) showLoadingIndicator.value = true;
});

/**
 * Handle incoming dashboard data (initial or subscription).
 * @param {{ dashboard?: any }|undefined} data
 */
const applyResult = (data) => {
  const dash = data?.dashboard;
  showLoadingIndicator.value = false;

  if (!dash && routeId.value) {
    // Dashboard not found, go to create new
    isEditing.value = true;
    router.push("/");
    return;
  }

  if (dash) {
    // Load new dashboard in store and mark as saved
    freeboardStore.loadDashboard(dash);
    isSaved.value = true;
  }
};

// React to initial query result
watch(result, () => applyResult(result.value));
// React to subscription updates
onSubResult(({ data }) => applyResult(data));

// ----------------------------------------------------------------------------
// Persist settings on dashboard mutation
// ----------------------------------------------------------------------------
const d = reactive(dashboard.value);
watch(d, () => freeboardStore.saveSettingsToLocalStorage());

// ----------------------------------------------------------------------------
// Initial plugin registration and baseline UI state
// ----------------------------------------------------------------------------
freeboardStore.loadSettingsFromLocalStorage(!routeId.value);
freeboardStore.loadDashboardAssets();
freeboardStore.loadDashboardTheme();
freeboardStore.loadAuthPlugin(HeaderAuthProvider);
freeboardStore.loadAuthPlugin(OAuth2PasswordGrantProvider);
freeboardStore.loadDatasourcePlugin(JSONDatasource);
freeboardStore.loadDatasourcePlugin(ClockDatasource);
freeboardStore.loadWidgetPlugin(BaseWidget);

// Determine edit mode based on static build or login
freeboardStore.allowEdit = __FREEBOARD_STATIC__ || freeboardStore.isLoggedIn();
freeboardStore.isEditing = __FREEBOARD_STATIC__ || freeboardStore.isLoggedIn();

// Hide loader after baseline setup (query watcher will override as needed)
showLoadingIndicator.value = false;
</script>

<template>
  <Transition>
    <div class="freeboard">
      <!-- Loading indicator -->
      <Preloader v-if="showLoadingIndicator" />
      <!-- Main UI when loaded -->
      <Header v-else />
      <Board v-if="!showLoadingIndicator" />
    </div>
  </Transition>
</template>

<style lang="css" scoped>
@import url("../assets/css/components/freeboard.css");
</style>
