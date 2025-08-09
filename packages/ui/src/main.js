/**
 * @module main
 * @description Entry point for Freeboard UI: configures Vue app, Apollo client, routing, state, i18n, and mounts the App component.
 */

import { createApp, provide, h } from "vue";
import { DefaultApolloClient } from "@vue/apollo-composable";
import {
  ApolloClient,
  ApolloLink,
  HttpLink,
  InMemoryCache,
} from "@apollo/client/core";
import { onError } from "apollo-link-error";
import App from "./App.vue";
import monaco from "./monaco";
import { install as VueMonacoEditorPlugin } from "@guolao/vue-monaco-editor";
import { OhVueIcon, addIcons } from "oh-vue-icons";
import {
  HiDatabase,
  HiEye,
  HiCloudUpload,
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

import { createPinia, storeToRefs } from "pinia";
import router from "./router";
import { useFreeboardStore } from "./stores/freeboard";
import { SSELink } from "./sse";
import { createHead } from "@unhead/vue";
import { createI18n } from "vue-i18n";
import { en } from "./i18n/en";

// Register icon set for use throughout the app
addIcons(
  HiDatabase,
  HiEye,
  HiCloudUpload,
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
  HiPause
);

// Initialize internationalization
const i18n = createI18n({
  locale: "en",
  fallbackLocale: "en",
  messages: {
    en,
  },
});

// Initialize head manager for meta tags
const head = createHead();

// Initialize Pinia store
const pinia = createPinia();

// Apollo cache instance
const cache = new InMemoryCache();

/**
 * Retrieve HTTP headers for GraphQL requests, including Authorization if token present.
 *
 * @returns {Object<string, string>} HTTP headers object.
 */
const getHeaders = () => {
  const headers = {};
  const freeboardStore = useFreeboardStore();
  const { token } = storeToRefs(freeboardStore);
  if (token.value) {
    headers["Authorization"] = `Bearer ${token.value}`;
  }
  headers["Content-Type"] = "application/json";
  return headers;
};

/**
 * Apollo Link to handle GraphQL errors: logs out user and redirects to login page.
 */
const errorLink = onError(({ graphQLErrors, networkError }) => {
  if (graphQLErrors) {
    const store = useFreeboardStore();
    store.logout();
    router.push("/login");
  }
});

/**
 * HTTP link for Apollo to send queries and mutations, injecting auth headers.
 *
 * @type {HttpLink}
 */
const httpLink = new HttpLink({
  uri: `/graphql`,
  fetch: (uri, options) => {
    options.headers = getHeaders();
    return fetch(uri, options);
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
    ApolloLink.split(
      (operation) => operation.getContext().apiName === "stream",
      sseLink,
      httpLink
    ),
  ]),
});

/**
 * Initialize and mount the Vue application with all plugins and global components.
 *
 * @type {import('vue').App}
 */
const app = createApp({
  setup() {
    provide(DefaultApolloClient, apolloClient);
  },
  
  render: () => h(App),
})
  .use(pinia)
  .use(router)
  .use(i18n)
  .use(head)
  .use(VueMonacoEditorPlugin, { monaco })
  .component("v-icon", OhVueIcon)
  .mount("#app");
