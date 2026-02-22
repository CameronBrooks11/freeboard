/**
 * @module main
 * @description Entry point for Freeboard UI: configures Vue app, Apollo client, routing, state, i18n, and mounts the App component.
 */

import { createApp, watch } from "vue";
import { DefaultApolloClient } from "@vue/apollo-composable";
import { ApolloClient, ApolloLink, HttpLink, InMemoryCache } from "@apollo/client/core";
import { onError } from "@apollo/client/link/error";
import App from "./App.vue";
import { OhVueIcon, addIcons } from "oh-vue-icons";
import {
  HiDatabase,
  HiEye,
  HiCloudUpload,
  HiCollection,
  HiPlusCircle,
  HiDownload,
  HiUpload,
  HiPlus,
  HiClipboardList,
  HiTrash,
  HiSolidChevronUp,
  HiSolidCog,
  HiCog,
  HiCode,
  HiSolidChevronDown,
  HiRefresh,
  HiSolidChevronDoubleLeft,
  HiSolidChevronDoubleRight,
  HiVariable,
  HiHome,
  HiArchive,
  HiPencilAlt,
  HiBeaker,
  HiBriefcase,
  HiPlay,
  HiPause,
} from "oh-vue-icons/icons";

import { createPinia } from "pinia";
import routerTyped from "./router/index.js";
import { useAuthStore } from "./stores/auth.js";
import { useDashboardStore } from "./stores/dashboard.js";
import { useProfileCatalogStore } from "./stores/profileCatalog.js";
import { bootstrapApp } from "./bootstrap/appBootstrap.js";
import { SSELink } from "./sse.js";
import { createHead } from "@unhead/vue";
import { i18n } from "./i18n/index.js";
import { shouldForceLogoutOnGraphQLErrors } from "./apolloAuthError.js";
import { subscribeToSystemThemeChanges } from "./ui/themeRuntime.js";

// Register icon set for use throughout the app
addIcons(
  HiDatabase,
  HiEye,
  HiCloudUpload,
  HiCollection,
  HiPlusCircle,
  HiDownload,
  HiUpload,
  HiPlus,
  HiClipboardList,
  HiTrash,
  HiSolidChevronUp,
  HiSolidCog,
  HiCog,
  HiCode,
  HiSolidChevronDown,
  HiRefresh,
  HiSolidChevronDoubleLeft,
  HiSolidChevronDoubleRight,
  HiVariable,
  HiHome,
  HiArchive,
  HiPencilAlt,
  HiBeaker,
  HiBriefcase,
  HiPlay,
  HiPause,
);

// Initialize head manager for meta tags
const head = createHead();

// Initialize Pinia store
const pinia = createPinia();
const authStore = useAuthStore(pinia);
const dashboardStore = useDashboardStore(pinia);
const profileCatalogStore = useProfileCatalogStore(pinia);

// Apollo cache instance
const cache = new InMemoryCache();

/**
 * Retrieve HTTP headers for GraphQL requests, including Authorization if token present.
 *
 * @returns {Object<string, string>} HTTP headers object.
 */
const getHeaders = (): Record<string, string> => {
  const headers: Record<string, string> = {};
  if (authStore.token) {
    headers["Authorization"] = `Bearer ${authStore.token}`;
  }
  headers["Content-Type"] = "application/json";
  return headers;
};

/**
 * Apollo Link to handle GraphQL auth errors: logs out user and redirects to login page.
 */
const errorLink = onError(({ graphQLErrors }) => {
  if (shouldForceLogoutOnGraphQLErrors(graphQLErrors)) {
    authStore.logout();
    profileCatalogStore.clearCredentialProfiles();
    profileCatalogStore.clearBrokerProfiles();
    dashboardStore.syncEditingPermissions();
    routerTyped.push("/login");
  }
});

/**
 * HTTP link for Apollo to send queries and mutations, injecting auth headers.
 *
 * @type {HttpLink}
 */
const httpLink = new HttpLink({
  uri: `/graphql`,
  fetch: (uri, options = {}) => {
    const requestOptions = {
      ...options,
      headers: getHeaders(),
    };
    return fetch(uri, requestOptions);
  },
});

/**
 * SSE link for Apollo to handle GraphQL subscriptions over Server-Sent Events.
 *
 * @type {SSELink}
 */
const sseLink = new SSELink({
  url: `/graphql`,
  headers: getHeaders,
});

/**
 * Apollo Client instance configured with HTTP and SSE links.
 *
 * @type {ApolloClient}
 */
const apolloClient = new ApolloClient({
  cache,
  link: ApolloLink.from([
    errorLink,
    ApolloLink.split((operation) => operation.getContext().apiName === "stream", sseLink, httpLink),
  ]),
});

/**
 * Initialize and mount the Vue application with all plugins and global components.
 *
 * @type {import('vue').App}
 */
const app = createApp(App);
app.provide(DefaultApolloClient, apolloClient);
app.use(pinia);
bootstrapApp({ pinia });

const syncDashboardTheme = () => {
  dashboardStore.loadDashboardTheme();
};

watch(
  () => dashboardStore.dashboard.settings?.theme,
  () => {
    syncDashboardTheme();
  },
  { immediate: true },
);

const stopSystemThemeListener = subscribeToSystemThemeChanges(() => {
  syncDashboardTheme();
});

if (typeof window !== "undefined") {
  window.addEventListener("beforeunload", stopSystemThemeListener, { once: true });
}

app.use(routerTyped).use(i18n).use(head).component("v-icon", OhVueIcon).mount("#app");
