import assert from "node:assert/strict";
import test from "node:test";

import { ApolloClient, ApolloLink, InMemoryCache } from "@apollo/client/core";
import { Observable } from "rxjs";
import { computed, effectScope, reactive, watch } from "vue";

// `@vue/apollo-composable` computes `isServer` from `window` at load time, so
// define it before the composable is imported.
(globalThis as { window?: unknown }).window ??= {};
const { provideApolloClient } = await import("@vue/apollo-composable");
const { useDashboardRead } = await import("../src/dashboardRead.js");
const { DASHBOARD_READ_QUERY, DASHBOARD_READ_BY_SHARE_TOKEN_QUERY } = await import("../src/gql.js");

const settle = () => new Promise((resolve) => setTimeout(resolve, 20));

const dashboardFor = (id: string) => ({
  __typename: "Dashboard",
  _id: id,
  visibility: "private",
  shareToken: null,
  shareTokenVersion: 0,
  document: {},
  documentRevision: 1,
  user: "user-1",
  acl: [],
  isOwner: true,
  canEdit: true,
  canManageSharing: true,
});

/**
 * Mount both dashboard reads the way Freeboard.vue wires them, against an
 * Apollo Client whose terminating link answers each read a moment later: the
 * id or token "missing" gets the server's not-found GraphQL error. `redirects`
 * records each decision Freeboard.vue would turn into `router.push("/")`: an
 * error from either read, or a response that carries no dashboard.
 */
const mountReads = (initial: { id?: string; shareToken?: string }) => {
  const requests: Record<string, unknown>[] = [];
  const link = new ApolloLink(
    (operation) =>
      new Observable((observer) => {
        const { id, shareToken } = operation.variables;
        const key = String(id ?? shareToken);
        const field = id === undefined ? "dashboardByShareToken" : "dashboard";
        requests.push(operation.variables);
        const timer = setTimeout(() => {
          observer.next(
            key === "missing"
              ? { data: { [field]: null }, errors: [{ message: "Dashboard not found" }] }
              : { data: { [field]: dashboardFor(key) } },
          );
          observer.complete();
        }, 1);
        return () => clearTimeout(timer);
      }),
  );
  provideApolloClient(new ApolloClient({ link, cache: new InMemoryCache() }));

  const props = reactive<{ id?: string; shareToken?: string }>(initial);
  const routeId = computed(() => props.id || undefined);
  const routeShareToken = computed(() => props.shareToken || undefined);
  const queryEnabledById = computed(() => !!routeId.value && !routeShareToken.value);
  const queryEnabledByShareToken = computed(() => !!routeShareToken.value);

  const loaded: string[] = [];
  const redirects: string[] = [];
  const scope = effectScope();
  scope.run(() => {
    const byId = useDashboardRead(
      DASHBOARD_READ_QUERY,
      () => ({ id: routeId.value }),
      queryEnabledById,
    );
    const byShareToken = useDashboardRead(
      DASHBOARD_READ_BY_SHARE_TOKEN_QUERY,
      () => ({ shareToken: routeShareToken.value }),
      queryEnabledByShareToken,
    );
    watch([byId.error, byShareToken.error], ([idError, shareError]) => {
      if (idError || shareError) {
        redirects.push(`error: ${(idError || shareError)?.message}`);
      }
    });
    for (const read of [byId, byShareToken]) {
      read.onResponse((data) => {
        const dash = data?.dashboard || data?.dashboardByShareToken;
        if (!dash && (routeId.value || routeShareToken.value)) {
          redirects.push("no dashboard in response");
        } else if (dash) {
          loaded.push(String(dash._id));
        }
      });
    }
  });
  return { props, requests, loaded, redirects, scope };
};

test("reopening a dashboard by id after / loads it again without a redirect", async () => {
  const { props, requests, loaded, redirects, scope } = mountReads({ id: "dash-1" });
  await settle();
  props.id = undefined;
  await settle();
  props.id = "dash-1";
  await settle();

  assert.deepEqual(requests, [{ id: "dash-1" }, { id: "dash-1" }]);
  assert.deepEqual(loaded, ["dash-1", "dash-1"]);
  assert.deepEqual(redirects, []);
  scope.stop();
});

test("switching dashboards loads the next one without a redirect", async () => {
  const { props, loaded, redirects, scope } = mountReads({ id: "dash-1" });
  await settle();
  props.id = "dash-2";
  await settle();

  assert.deepEqual(loaded, ["dash-1", "dash-2"]);
  assert.deepEqual(redirects, []);
  scope.stop();
});

test("reopening a share link after / loads it again without a redirect", async () => {
  const { props, requests, loaded, redirects, scope } = mountReads({ shareToken: "token-1" });
  await settle();
  props.shareToken = undefined;
  await settle();
  props.shareToken = "token-1";
  await settle();

  assert.deepEqual(requests, [{ shareToken: "token-1" }, { shareToken: "token-1" }]);
  assert.deepEqual(loaded, ["token-1", "token-1"]);
  assert.deepEqual(redirects, []);
  scope.stop();
});

test("loading a dashboard the server does not return redirects", async () => {
  const { loaded, redirects, scope } = mountReads({ id: "missing" });
  await settle();

  assert.deepEqual(loaded, []);
  assert.deepEqual(redirects, ["no dashboard in response"]);
  scope.stop();
});

test("opening a dashboard the server does not return after / redirects", async () => {
  const { props, loaded, redirects, scope } = mountReads({ id: "dash-1" });
  await settle();
  props.id = undefined;
  await settle();
  props.id = "missing";
  await settle();

  assert.deepEqual(loaded, ["dash-1"]);
  assert.deepEqual(redirects, ["no dashboard in response"]);
  scope.stop();
});

test("loading a share token the server does not recognise redirects", async () => {
  const { loaded, redirects, scope } = mountReads({ shareToken: "missing" });
  await settle();

  assert.deepEqual(loaded, []);
  assert.deepEqual(redirects, ["no dashboard in response"]);
  scope.stop();
});
