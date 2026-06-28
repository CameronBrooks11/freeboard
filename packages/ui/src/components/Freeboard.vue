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
// document injected by an embedder via postMessage. Two checks gate the sender:
// it must be the direct parent frame (not an arbitrary nested/sibling frame or
// other window), and its origin must be allowed (the allowlist is empty/`*` =
// accept any, since the document is validated and runs in safe execution mode).
const onEmbedMessage = (event: MessageEvent) => {
  if (event.source !== window.parent) {
    return;
  }
  if (!isEmbedOriginAllowed(event.origin)) {
    return;
  }
  void dashboardStore.loadEmbeddedDocument(event.data);
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
  { fromSubscription = false }: { fromSubscription?: boolean } = {},
) => {
  const dash = data?.dashboard || data?.dashboardByShareToken;

  if (fromSubscription) {
    // A terminal null on the live stream means the server ended our access
    // (revoked, or the dashboard was deleted). Surface it and leave edit mode;
    // unsaved edits are preserved for the user to reload or export.
    if (dash == null) {
      dashboardStore.noteRemoteEditAccessLost();
      return;
    }
    // Never let a live update overwrite UNSAVED local edits — but a clean editor
    // (board open, nothing changed) still gets live updates. With pending edits
    // we keep the in-progress document and surface the remote change instead: a
    // save would CONFLICT if the document advanced, and a downgraded canEdit
    // means edit access was revoked.
    if (dashboardStore.hasUnsavedChanges) {
      if ((dash as Record<string, unknown>).canEdit === false) {
        dashboardStore.noteRemoteEditAccessLost();
      } else {
        dashboardStore.noteRemoteUpdatePending();
      }
      return;
    }
  }

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
onSubResult(({ data }) => applyResult(data, { fromSubscription: true }));

// Reload to pull the latest server state (discarding local edits) when the user
// acts on the remote-change banner.
const reloadDashboard = () => {
  window.location.reload();
};

// Hide loader after baseline setup (query watcher will override as needed)
showLoadingIndicator.value = false;
</script>

<template>
  <div class="freeboard">
    <!-- Loading indicator -->
    <Preloader v-if="showLoadingIndicator" />
    <!-- Main UI when loaded -->
    <Header v-else />
    <div
      v-if="
        !showLoadingIndicator &&
        (dashboardStore.remoteEditAccessLost || dashboardStore.remoteUpdatePending)
      "
      class="freeboard__remote-banner"
      :role="dashboardStore.remoteEditAccessLost ? 'alert' : 'status'"
      :aria-live="dashboardStore.remoteEditAccessLost ? 'assertive' : 'polite'"
    >
      <span>{{
        dashboardStore.remoteEditAccessLost
          ? $t("dashboard.remoteEditAccessLost")
          : $t("dashboard.remoteUpdatePending")
      }}</span>
      <button type="button" class="freeboard__remote-banner__action" @click="reloadDashboard">
        {{ $t("dashboard.reload") }}
      </button>
    </div>
    <main v-if="!showLoadingIndicator" class="freeboard__main">
      <Board />
    </main>
  </div>
</template>

<style lang="css" scoped>
@import url("../assets/css/components/freeboard.css");

.freeboard__remote-banner {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
  padding: 0.5rem 1rem;
  background: var(--bg-surface-3);
  color: var(--text-secondary);
  border-bottom: 1px solid var(--color-shade-3);
  font-size: 0.9rem;
}

.freeboard__remote-banner__action {
  color: var(--text-link);
  background: none;
  border: none;
  padding: 0.25rem 0.5rem;
  cursor: pointer;
  text-decoration: underline;
  font: inherit;
}
</style>
