<script setup lang="ts">
/**
 * @component Freeboard
 * @description Root component that fetches/subscribes to dashboard data,
 *              and renders header + board. Reacts to route `/:id` changes without remounting.
 *
 * @prop {string} id - Optional dashboard ID to load (provided by vue-router via props).
 */
defineOptions({ name: "Freeboard" });

import { computed, onMounted, onUnmounted, watch } from "vue";
import Header from "./Header.vue";
import Board from "./Board.vue";
import { useAuthStore } from "../stores/auth.js";
import { useDashboardStore } from "../stores/dashboard.js";
import { useProfileCatalogStore } from "../stores/profileCatalog.js";
import { useQuery, useSubscription } from "@vue/apollo-composable";
import {
  DASHBOARD_READ_QUERY,
  DASHBOARD_READ_BY_SHARE_TOKEN_QUERY,
  DASHBOARD_UPDATE_SUBSCRIPTION,
  BROKER_PROFILES_QUERY,
  CREDENTIAL_PROFILES_QUERY,
  PUBLIC_AUTH_POLICY_QUERY,
} from "../gql.js";
import router from "../router";
import { runtimeConfig } from "../runtime/config.js";
import { isEmbedOriginAllowed } from "../runtime/embed.js";
import { storeToRefs } from "pinia";
import Preloader from "./Preloader.vue";
import {
  disposeAllStreamingManagers,
  disposeStreamingManager,
} from "../datasources/runtime/StreamingManager";

// ----------------------------------------------------------------------------
// Store & theming
// ----------------------------------------------------------------------------
const authStore = useAuthStore();
const dashboardStore = useDashboardStore();
const profileCatalogStore = useProfileCatalogStore();
const { showLoadingIndicator, isSaved, dashboard } = storeToRefs(dashboardStore);

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
} = useQuery(DASHBOARD_READ_QUERY, () => ({ id: routeId.value }), {
  enabled: queryEnabledById,
  fetchPolicy: "network-only",
});

const {
  result: resultByShareToken,
  loading: loadingByShareToken,
  error: errorByShareToken,
} = useQuery(DASHBOARD_READ_BY_SHARE_TOKEN_QUERY, () => ({ shareToken: routeShareToken.value }), {
  enabled: queryEnabledByShareToken,
  fetchPolicy: "network-only",
});

/**
 * Subscribe to dashboard updates (SSE). Also reactive to the current `id`.
 */
const { onResult: onSubResult } = useSubscription(
  DASHBOARD_UPDATE_SUBSCRIPTION,
  () => ({ id: routeId.value }),
  { context: { apiName: "stream" }, enabled: queryEnabledById },
);

const { result: publicPolicyResult } = useQuery(
  PUBLIC_AUTH_POLICY_QUERY,
  {},
  {
    fetchPolicy: "network-only",
    // Local-first (Lite): a static build has no server; the auth store keeps its
    // safe default policy, so this is the one boot query to disable.
    enabled: !runtimeConfig.isStaticBuild,
  },
);

const credentialProfilesQueryEnabled = computed(
  () => authStore.isLoggedIn() && authStore.canEditDashboards(),
);
const { result: credentialProfilesResult, error: credentialProfilesError } = useQuery(
  CREDENTIAL_PROFILES_QUERY,
  {},
  {
    fetchPolicy: "network-only",
    enabled: credentialProfilesQueryEnabled,
  },
);
const { result: brokerProfilesResult, error: brokerProfilesError } = useQuery(
  BROKER_PROFILES_QUERY,
  {},
  {
    fetchPolicy: "network-only",
    enabled: credentialProfilesQueryEnabled,
  },
);

watch(publicPolicyResult, () => {
  const policy = publicPolicyResult.value?.publicAuthPolicy;
  if (policy) {
    const executionModeChanged = authStore.setPublicAuthPolicy(policy);
    if (executionModeChanged) {
      dashboardStore.loadDashboardAssets();
    }
    dashboardStore.syncEditingPermissions();
  }
});

watch(credentialProfilesResult, () => {
  const profiles = credentialProfilesResult.value?.credentialProfiles;
  profileCatalogStore.setCredentialProfiles(Array.isArray(profiles) ? profiles : []);
});

watch(brokerProfilesResult, () => {
  const profiles = brokerProfilesResult.value?.brokerProfiles;
  profileCatalogStore.setBrokerProfiles(Array.isArray(profiles) ? profiles : []);
});

watch(credentialProfilesError, () => {
  if (credentialProfilesError.value) {
    profileCatalogStore.clearCredentialProfiles();
  }
});

watch(brokerProfilesError, () => {
  if (brokerProfilesError.value) {
    profileCatalogStore.clearBrokerProfiles();
  }
});

watch(credentialProfilesQueryEnabled, (enabled) => {
  if (!enabled) {
    profileCatalogStore.clearCredentialProfiles();
    profileCatalogStore.clearBrokerProfiles();
  }
});

watch(
  () => dashboard.value?._id || null,
  (nextDashboardId, previousDashboardId) => {
    if (previousDashboardId && nextDashboardId && previousDashboardId !== nextDashboardId) {
      disposeStreamingManager(previousDashboardId);
    }
  },
);

onUnmounted(() => {
  disposeAllStreamingManagers();
});

// Local-first (Lite): a static build has no server route to load from, so on
// mount hydrate from localStorage and start listening for a cross-origin
// document injected by an embedder via postMessage. The sender origin is
// verified at this boundary (the allowlist is empty/`*` = accept any, since the
// document is validated and runs in safe execution mode).
const onEmbedMessage = (event: MessageEvent) => {
  if (!isEmbedOriginAllowed(event.origin)) {
    return;
  }
  void dashboardStore.loadEmbeddedDocument(event.origin, event.data);
};
if (runtimeConfig.isStaticBuild) {
  onMounted(() => {
    void dashboardStore.loadLocalDashboard();
    window.addEventListener("message", onEmbedMessage);
  });
  onUnmounted(() => {
    window.removeEventListener("message", onEmbedMessage);
  });
}

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
watch(
  [routeId, routeShareToken],
  ([id, shareToken]) => {
    authStore.setRuntimeShareToken(shareToken || null);
    if (id || shareToken) {
      showLoadingIndicator.value = true;
    }
  },
  { immediate: true },
);

/**
 * Handle incoming dashboard data (initial or subscription).
 * @param {{ dashboard?: unknown }|undefined} data
 */
const applyResult = (
  data:
    | {
        dashboard?: Record<string, unknown> | null;
        dashboardByShareToken?: Record<string, unknown> | null;
      }
    | undefined,
) => {
  const dash = data?.dashboard || data?.dashboardByShareToken;
  showLoadingIndicator.value = false;

  if (!dash && (routeId.value || routeShareToken.value)) {
    // Dashboard not found, go to create new
    dashboardStore.syncEditingPermissions();
    router.push("/");
    return;
  }

  if (dash) {
    // Mark as saved before loading so permission sync can use dashboard-level ACL flags.
    isSaved.value = true;
    dashboardStore.loadDashboard(dash);
    dashboardStore.syncEditingPermissions();
  }
};

// React to initial query results.
// `useQuery().result` already contains the GraphQL data object shape
// ({ dashboard } / { dashboardByShareToken }), so do not access `.data`.
watch(resultById, (value) => applyResult(value));
watch(resultByShareToken, (value) => applyResult(value));
// React to subscription updates
onSubResult(({ data }) => applyResult(data));

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
