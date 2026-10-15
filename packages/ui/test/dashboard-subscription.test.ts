import assert from "node:assert/strict";
import test from "node:test";

import { ApolloClient, ApolloLink, InMemoryCache } from "@apollo/client/core";
import { Observable } from "rxjs";
import { computed, effectScope, reactive } from "vue";

// `@vue/apollo-composable` never subscribes when `window` is undefined at load
// time, so define it before the composable is imported.
(globalThis as { window?: unknown }).window ??= {};
const { provideApolloClient } = await import("@vue/apollo-composable");
const { useDashboardSubscription } = await import("../src/dashboardSubscription.js");

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

/**
 * Mount the dashboard subscription the way Freeboard.vue wires it, against an
 * Apollo Client whose terminating link records each subscription it receives
 * and each one it is told to cancel.
 */
const mountSubscription = (initialId?: string) => {
  const started: Record<string, unknown>[] = [];
  const cancelled: Record<string, unknown>[] = [];
  const link = new ApolloLink(
    (operation) =>
      new Observable(() => {
        const variables = operation.variables;
        started.push(variables);
        return () => {
          cancelled.push(variables);
        };
      }),
  );
  provideApolloClient(new ApolloClient({ link, cache: new InMemoryCache() }));

  const props = reactive<{ id?: string; shareToken?: string }>({ id: initialId });
  const routeId = computed(() => props.id || undefined);
  const routeShareToken = computed(() => props.shareToken || undefined);
  const queryEnabledById = computed(() => !!routeId.value && !routeShareToken.value);

  const scope = effectScope();
  scope.run(() => useDashboardSubscription(routeId, queryEnabledById));
  return { props, started, cancelled, scope };
};

test("opening a dashboard from / starts one subscription, carrying the id", async () => {
  const { props, started, cancelled, scope } = mountSubscription();
  await settle();
  assert.deepEqual(started, []);

  props.id = "dash-1";
  await settle();

  assert.deepEqual(started, [{ id: "dash-1" }]);
  assert.deepEqual(cancelled, []);
  scope.stop();
});

test("loading a dashboard route directly starts one subscription", async () => {
  const { started, cancelled, scope } = mountSubscription("dash-1");
  await settle();

  assert.deepEqual(started, [{ id: "dash-1" }]);
  assert.deepEqual(cancelled, []);
  scope.stop();
});

test("switching dashboards replaces the subscription", async () => {
  const { props, started, cancelled, scope } = mountSubscription("dash-1");
  await settle();

  props.id = "dash-2";
  await settle();

  assert.deepEqual(started, [{ id: "dash-1" }, { id: "dash-2" }]);
  assert.deepEqual(cancelled, [{ id: "dash-1" }]);
  scope.stop();
});

test("leaving a dashboard for / ends the subscription without a new one", async () => {
  const { props, started, cancelled, scope } = mountSubscription("dash-1");
  await settle();

  props.id = undefined;
  await settle();

  assert.deepEqual(started, [{ id: "dash-1" }]);
  assert.deepEqual(cancelled, [{ id: "dash-1" }]);
  scope.stop();
});
