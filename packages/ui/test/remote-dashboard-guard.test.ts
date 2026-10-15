import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";

import { ApolloClient, ApolloLink, InMemoryCache } from "@apollo/client/core";
import { createPinia, setActivePinia } from "pinia";
import { Observable } from "rxjs";
import { computed, effectScope, ref, watch } from "vue";

// `@vue/apollo-composable` never subscribes when `window` is undefined at load
// time, so define it before the composable is imported.
(globalThis as { window?: unknown }).window ??= {};
const { provideApolloClient, useQuery, useSubscription } = await import("@vue/apollo-composable");
const { DASHBOARD_READ_QUERY, DASHBOARD_UPDATE_MUTATION, DASHBOARD_UPDATE_SUBSCRIPTION } =
  await import("../src/gql.js");
const { useDashboardStore } = await import("../src/stores/dashboard.js");
const { holdRemoteDashboard } = await import("../src/remoteDashboardGuard.js");

const settle = () => new Promise((resolve) => setTimeout(resolve, 20));

// Minimal browser stubs for the store's asset/theme side-effects on load.
const installBrowserStubs = () => {
  const previousWindow = globalThis.window;
  const previousDocument = globalThis.document;
  (globalThis as Record<string, unknown>).window = {
    matchMedia() {
      return { matches: false };
    },
    addEventListener() {},
    removeEventListener() {},
  };
  const rootAttributes: Record<string, string> = {};
  (globalThis as Record<string, unknown>).document = {
    documentElement: {
      style: {},
      setAttribute(name: string, value: unknown) {
        rootAttributes[name] = String(value);
      },
      getAttribute(name: string) {
        return rootAttributes[name] ?? null;
      },
      removeAttribute(name: string) {
        delete rootAttributes[name];
      },
    },
    createElement() {
      return { setAttribute() {}, appendChild() {}, remove() {}, style: {} };
    },
    head: { appendChild() {} },
    body: { appendChild() {}, removeChild() {} },
    getElementsByTagName() {
      return [{ appendChild() {} }];
    },
  };
  return () => {
    (globalThis as Record<string, unknown>).window = previousWindow;
    (globalThis as Record<string, unknown>).document = previousDocument;
  };
};

let restoreBrowserStubs: (() => void) | null = null;
let stopScope: (() => void) | null = null;

beforeEach(() => {
  setActivePinia(createPinia());
  restoreBrowserStubs = installBrowserStubs();
});

afterEach(() => {
  stopScope?.();
  stopScope = null;
  restoreBrowserStubs?.();
  restoreBrowserStubs = null;
});

const record = (
  id: string,
  documentRevision: number,
  columns: number,
  extra: Record<string, unknown> = {},
) => ({
  __typename: "Dashboard",
  _id: id,
  visibility: "private",
  shareToken: null,
  shareTokenVersion: 0,
  document: {
    schemaVersion: 1,
    title: id,
    columns,
    width: "md",
    settings: { theme: "auto" },
    datasources: [],
    panes: [],
  },
  documentRevision,
  user: "user-1",
  acl: [],
  isOwner: true,
  canEdit: true,
  canManageSharing: true,
  ...extra,
});

/**
 * Wire the read query and the live subscription the way Freeboard.vue does,
 * against a real Apollo Client and InMemoryCache. The terminating link answers
 * each read from `server` and keeps each subscription open for `push`.
 */
const mountDashboard = (initialId: string) => {
  const server: Record<string, ReturnType<typeof record>> = {
    "dash-1": record("dash-1", 4, 3),
    "dash-2": record("dash-2", 1, 2),
  };
  const subscribers: Array<(value: unknown) => void> = [];
  const link = new ApolloLink(
    (operation) =>
      new Observable((observer) => {
        if (operation.operationName === "DashboardRead") {
          const timer = setTimeout(() => {
            observer.next({ data: { dashboard: server[operation.variables.id as string] } });
            observer.complete();
          }, 1);
          return () => clearTimeout(timer);
        }
        if (operation.operationName === "DashboardUpdate") {
          const input = operation.variables.dashboard as Record<string, unknown>;
          const saved = record(
            operation.variables.id as string,
            Number(input.expectedDocumentRevision) + 1,
            0,
            { document: input.document },
          );
          const timer = setTimeout(() => {
            observer.next({ data: { updateDashboard: saved } });
            observer.complete();
          }, 1);
          return () => clearTimeout(timer);
        }
        subscribers.push((value) => observer.next(value));
        return undefined;
      }),
  );
  const client = new ApolloClient({ link, cache: new InMemoryCache() });
  provideApolloClient(client);

  const store = useDashboardStore();
  const loads: number[] = [];
  store.$onAction(({ name, args }) => {
    if (name === "loadDashboard") {
      loads.push(Number((args[0] as Record<string, unknown>).documentRevision));
    }
  });
  const queryResults: number[] = [];
  const subscriptionResults: number[] = [];

  const routeId = ref<string | undefined>(initialId);
  const enabled = computed(() => !!routeId.value);

  let navigatedHome = false;

  // Freeboard.vue `applyResult`, minus the loader side-effects.
  const applyResult = (
    data: { dashboard?: Record<string, unknown> | null } | undefined,
    { fromSubscription = false }: { fromSubscription?: boolean } = {},
  ) => {
    const dash = data?.dashboard;
    if (holdRemoteDashboard(store, dash, { fromSubscription })) {
      return;
    }
    if (!dash) {
      navigatedHome = true;
      return;
    }
    store.loadDashboard(dash);
  };

  const scope = effectScope();
  scope.run(() => {
    const { result } = useQuery(DASHBOARD_READ_QUERY, () => ({ id: routeId.value }), {
      enabled,
      fetchPolicy: "network-only",
    });
    watch(result, (value) => {
      queryResults.push(Number(value?.dashboard?.documentRevision));
      applyResult(value);
    });
    const { onResult } = useSubscription(
      DASHBOARD_UPDATE_SUBSCRIPTION,
      () => ({ id: routeId.value }),
      {
        enabled,
      },
    );
    onResult(({ data }) => {
      subscriptionResults.push(Number(data?.dashboard?.documentRevision));
      if (data) {
        applyResult(data, { fromSubscription: true });
      }
    });
  });
  stopScope = () => scope.stop();

  const push = (value: unknown) => subscribers.at(-1)?.(value);
  return {
    client,
    store,
    routeId,
    loads,
    queryResults,
    subscriptionResults,
    push,
    navigatedHome: () => navigatedHome,
  };
};

test("a live update keeps unsaved edits and flags the remote change", async () => {
  const { store, loads, queryResults, subscriptionResults, push } = mountDashboard("dash-1");
  await settle();
  assert.equal(store.dashboard.columns, 3);

  store.dashboard.columns = 6;
  assert.equal(store.hasUnsavedChanges, true);

  push({ data: { dashboard: record("dash-1", 5, 7) } });
  await settle();

  // The update arrived on both paths: the subscription, and the read query
  // refreshed from the cache the subscription result wrote to.
  assert.deepEqual(subscriptionResults, [5]);
  assert.deepEqual(queryResults, [4, 5]);
  assert.deepEqual(loads, [4]);
  assert.equal(store.dashboard.columns, 6);
  assert.equal(store.dashboard.documentRevision, 4);
  assert.equal(store.hasUnsavedChanges, true);
  assert.equal(store.remoteUpdatePending, true);
  assert.equal(store.remoteEditAccessLost, false);
});

test("a cache-driven query result keeps unsaved edits and flags the remote change", async () => {
  const { client, store, loads, queryResults, subscriptionResults } = mountDashboard("dash-1");
  await settle();

  store.dashboard.columns = 6;
  client.cache.writeQuery({
    query: DASHBOARD_READ_QUERY,
    variables: { id: "dash-1" },
    data: { dashboard: record("dash-1", 5, 7) },
  });
  await settle();

  assert.deepEqual(subscriptionResults, []);
  assert.deepEqual(queryResults, [4, 5]);
  assert.deepEqual(loads, [4]);
  assert.equal(store.dashboard.columns, 6);
  assert.equal(store.hasUnsavedChanges, true);
  assert.equal(store.remoteUpdatePending, true);
});

test("a live update revoking edit access keeps unsaved edits and flags lost access", async () => {
  const { store, loads, push } = mountDashboard("dash-1");
  await settle();

  store.dashboard.columns = 6;
  push({ data: { dashboard: record("dash-1", 5, 7, { canEdit: false }) } });
  await settle();

  assert.deepEqual(loads, [4]);
  assert.equal(store.dashboard.columns, 6);
  assert.equal(store.remoteEditAccessLost, true);
  assert.equal(store.dashboard.canEdit, false);
});

test("a live update applies to a clean editor", async () => {
  const { store, loads, push } = mountDashboard("dash-1");
  await settle();

  push({ data: { dashboard: record("dash-1", 5, 7) } });
  await settle();

  assert.equal(loads.at(-1), 5);
  assert.equal(store.dashboard.columns, 7);
  assert.equal(store.dashboard.documentRevision, 5);
  assert.equal(store.hasUnsavedChanges, false);
  assert.equal(store.remoteUpdatePending, false);
});

test("a terminal null on the live stream flags lost access and keeps the document", async () => {
  const { store, loads, push, navigatedHome } = mountDashboard("dash-1");
  await settle();

  push({ data: { dashboard: null } });
  await settle();

  assert.equal(navigatedHome(), false);

  assert.deepEqual(loads, [4]);
  assert.equal(store.dashboard._id, "dash-1");
  assert.equal(store.remoteEditAccessLost, true);
});

test("navigating to another dashboard loads it even with unsaved edits", async () => {
  const { store, routeId, loads } = mountDashboard("dash-1");
  await settle();

  store.dashboard.columns = 6;
  routeId.value = "dash-2";
  await settle();

  assert.deepEqual(loads, [4, 1]);
  assert.equal(store.dashboard._id, "dash-2");
  assert.equal(store.dashboard.columns, 2);
  assert.equal(store.hasUnsavedChanges, false);
  assert.equal(store.remoteUpdatePending, false);
});

test("saving unsaved edits keeps them and raises no remote-change flag", async () => {
  const { client, store, queryResults } = mountDashboard("dash-1");
  await settle();

  store.dashboard.columns = 6;
  await store.saveDashboard(
    "dash-1",
    { document: store.dashboard.toDocument() },
    async () => undefined,
    ({ id, dashboard }) =>
      client.mutate({ mutation: DASHBOARD_UPDATE_MUTATION, variables: { id, dashboard } }),
  );
  await settle();

  // The mutation result refreshed the cached dashboard, so the read query
  // delivered the saved revision as well.
  assert.deepEqual(queryResults, [4, 5]);
  assert.equal(store.dashboard.columns, 6);
  assert.equal(store.dashboard.documentRevision, 5);
  assert.equal(store.hasUnsavedChanges, false);
  assert.equal(store.remoteUpdatePending, false);
});
