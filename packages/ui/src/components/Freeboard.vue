<script setup lang="js">
/**
 * @component Freeboard
 * @description Root component that initializes plugins, fetches and subscribes to dashboard data, and renders header and board.
 *
 * @prop {string} id - Optional dashboard ID to load.
 */
defineOptions({ name: 'Freeboard' });

import { reactive, ref, watch } from "vue";
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

const freeboardStore = useFreeboardStore();

// React to system color scheme changes
const cssClass = usePreferredColorScheme();

watch(
  cssClass,
  () => {
    freeboardStore.loadDashboardTheme();
  },
  { immediate: true }
);

// Dashboard ID prop
const { id } = defineProps({ id: String });

const idRef = ref(id);

const { showLoadingIndicator, isEditing, isSaved, dashboard } =
  storeToRefs(freeboardStore);

// Subscribe to live dashboard updates via SSE
const { onResult } = useSubscription(
  DASHBOARD_UPDATE_SUBSCRIPTION,
  () => ({ id: idRef.value }),
  { context: { apiName: "stream" }, enabled: !!idRef.value }
);

// Query initial dashboard data
const { result, loading, error } = useQuery(
  DASHBOARD_READ_QUERY,
  { id: idRef.value },
  { enabled: !!idRef.value }
);

// Redirect to home on error
watch(error, () => {
  router.push("/");
});

// Show loader while query is in flight
watch(loading, (l) => {
  showLoadingIndicator.value = l;
});

/**
 * Handle incoming dashboard data (initial or subscription).
 */
const handleResult = (newResult) => {
  showLoadingIndicator.value = false;
  const dash = newResult.dashboard;
  if (!dash && idRef.value) {
    // Dashboard not found, go to create new
    isEditing.value = true;
    router.push("/");
  } else if (dash) {
    idRef.value = dash._id;
    freeboardStore.loadDashboard(dash);
    isSaved.value = true;
  }
};

watch(result, handleResult);
onResult((res) => handleResult(res.data));

// Persist settings when dashboard reactive object changes
const d = reactive(dashboard.value);

watch(d, () => {
  freeboardStore.saveSettingsToLocalStorage();
});

// Initial plugin registration and load
freeboardStore.loadSettingsFromLocalStorage(!idRef.value);
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

// Hide loader after setup
showLoadingIndicator.value = false;
</script>

<template>
  <Transition>
    <div class="freeboard">
      <!-- Loading indicator -->
      <Preloader v-if="showLoadingIndicator" />
      <!-- Main UI when loaded -->
      <Header v-if="!showLoadingIndicator" />
      <Board v-if="!showLoadingIndicator" />
    </div>
  </Transition>
</template>

<style lang="css" scoped>
@import url("../assets/css/components/freeboard.css");
</style>
