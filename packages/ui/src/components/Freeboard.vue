<script setup lang="js">
/**
 * @component Freeboard
 * @description Root component that initializes plugins, fetches/subscribes to dashboard data,
 *              and renders header + board. Reacts to route `/:id` changes without remounting.
 *
 * @prop {string} id - Optional dashboard ID to load (provided by vue-router via props).
 */
defineOptions({ name: 'Freeboard' });

import { reactive, watch, computed } from "vue";
import Header from "./Header.vue";
import Board from "./Board.vue";
import { useFreeboardStore } from "../stores/freeboard";
import { useQuery, useSubscription } from "@vue/apollo-composable";
import {
  DASHBOARD_READ_QUERY,
  DASHBOARD_READ_BY_SHARE_TOKEN_QUERY,
  DASHBOARD_UPDATE_SUBSCRIPTION,
  PUBLIC_AUTH_POLICY_QUERY,
} from "../gql";
import router from "../router";
import { storeToRefs } from "pinia";
import Preloader from "./Preloader.vue";
import { ClockDatasource } from "../datasources/ClockDatasource";
import { JSONDatasource } from "../datasources/JSONDatasource";
import { HeaderAuthProvider } from "../auth/HeaderAuthProvider";
import { OAuth2PasswordGrantProvider } from "../auth/OAuth2PasswordGrantProvider";
import { usePreferredColorScheme } from "@vueuse/core";
import { BaseWidget } from "../widgets/BaseWidget";
import { TextWidget } from "../widgets/TextWidget";
import { IndicatorWidget } from "../widgets/IndicatorWidget";
import { GaugeWidget } from "../widgets/GaugeWidget";
import { PointerWidget } from "../widgets/PointerWidget";
import { PictureWidget } from "../widgets/PictureWidget";
import { HtmlWidget } from "../widgets/HtmlWidget";
import { SparklineWidget } from "../widgets/SparklineWidget";
import { MapWidget } from "../widgets/MapWidget";

// ----------------------------------------------------------------------------
// Store & theming
// ----------------------------------------------------------------------------
const freeboardStore = useFreeboardStore();
const { showLoadingIndicator, isSaved, dashboard } =
  storeToRefs(freeboardStore);

// React to system color scheme changes
const cssClass = usePreferredColorScheme();
watch(cssClass, () => freeboardStore.loadDashboardTheme(), { immediate: true });

// ----------------------------------------------------------------------------
// Props & reactive route id
// ----------------------------------------------------------------------------
const props = defineProps({ id: String, shareToken: String });
/** Reactive route id derived from props so it updates on `/:id` navigation. */
const routeId = computed(() => props.id || undefined);
/** Reactive share token route value for link/public access. */
const routeShareToken = computed(() => props.shareToken || undefined);
/** Enable id query only when there is an id route. */
const queryEnabledById = computed(() => !!routeId.value && !routeShareToken.value);
/** Enable share-token query only when there is a share token route. */
const queryEnabledByShareToken = computed(() => !!routeShareToken.value);

// ----------------------------------------------------------------------------
// GraphQL: initial query (reactive variables) + live updates (SSE)
// ----------------------------------------------------------------------------
/**
 * Query initial dashboard data. Variables and `enabled` are reactive so this
 * re-runs when the route `id` changes.
 */
const {
  result: resultById,
  loading: loadingById,
  error: errorById,
} = useQuery(
  DASHBOARD_READ_QUERY,
  () => ({ id: routeId.value }),
  { enabled: queryEnabledById, fetchPolicy: "network-only" }
);

const {
  result: resultByShareToken,
  loading: loadingByShareToken,
  error: errorByShareToken,
} = useQuery(
  DASHBOARD_READ_BY_SHARE_TOKEN_QUERY,
  () => ({ shareToken: routeShareToken.value }),
  { enabled: queryEnabledByShareToken, fetchPolicy: "network-only" }
);

/**
 * Subscribe to dashboard updates (SSE). Also reactive to the current `id`.
 */
const { onResult: onSubResult } = useSubscription(
  DASHBOARD_UPDATE_SUBSCRIPTION,
  () => ({ id: routeId.value }),
  { context: { apiName: "stream" }, enabled: queryEnabledById }
);

const { result: publicPolicyResult } = useQuery(PUBLIC_AUTH_POLICY_QUERY, {}, {
  fetchPolicy: "network-only",
});

watch(publicPolicyResult, () => {
  const policy = publicPolicyResult.value?.publicAuthPolicy;
  if (policy) {
    freeboardStore.setPublicAuthPolicy(policy);
  }
});

// Redirect to home on query error (e.g., not found/unauthorized)
watch([errorById, errorByShareToken], ([idError, shareError]) => {
  if (idError || shareError) {
    router.push("/");
  }
});

// Show loader while query is in flight
watch([loadingById, loadingByShareToken], ([idLoading, shareLoading]) => {
  showLoadingIndicator.value = Boolean(idLoading || shareLoading);
});

// Show loader when the route id changes (before the query returns)
watch([routeId, routeShareToken], ([id, shareToken]) => {
  if (id || shareToken) {
    showLoadingIndicator.value = true;
  }
});

/**
 * Handle incoming dashboard data (initial or subscription).
 * @param {{ dashboard?: any }|undefined} data
 */
const applyResult = (data) => {
  const dash = data?.dashboard || data?.dashboardByShareToken;
  showLoadingIndicator.value = false;

  if (!dash && (routeId.value || routeShareToken.value)) {
    // Dashboard not found, go to create new
    freeboardStore.syncEditingPermissions();
    router.push("/");
    return;
  }

  if (dash) {
    // Mark as saved before loading so permission sync can use dashboard-level ACL flags.
    isSaved.value = true;
    freeboardStore.loadDashboard(dash);
    freeboardStore.syncEditingPermissions();
  }
};

// React to initial query results
watch(resultById, () => applyResult(resultById.value));
watch(resultByShareToken, () => applyResult(resultByShareToken.value));
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
freeboardStore.loadSettingsFromLocalStorage();
freeboardStore.loadDashboardAssets();
freeboardStore.loadDashboardTheme();
freeboardStore.loadAuthPlugin(HeaderAuthProvider);
freeboardStore.loadAuthPlugin(OAuth2PasswordGrantProvider);
freeboardStore.loadDatasourcePlugin(JSONDatasource);
freeboardStore.loadDatasourcePlugin(ClockDatasource);
freeboardStore.loadWidgetPlugin(BaseWidget);
freeboardStore.loadWidgetPlugin(TextWidget);
freeboardStore.loadWidgetPlugin(IndicatorWidget);
freeboardStore.loadWidgetPlugin(GaugeWidget);
freeboardStore.loadWidgetPlugin(PointerWidget);
freeboardStore.loadWidgetPlugin(PictureWidget);
freeboardStore.loadWidgetPlugin(HtmlWidget);
freeboardStore.loadWidgetPlugin(SparklineWidget);
freeboardStore.loadWidgetPlugin(MapWidget);
freeboardStore.syncEditingPermissions();

// Hide loader after baseline setup (query watcher will override as needed)
showLoadingIndicator.value = false;
</script>

<template>
  <div class="freeboard">
    <!-- Loading indicator -->
    <Preloader v-if="showLoadingIndicator" />
    <!-- Main UI when loaded -->
    <Header v-else />
    <Board v-if="!showLoadingIndicator" />
  </div>
</template>

<style lang="css" scoped>
@import url("../assets/css/components/freeboard.css");
</style>
