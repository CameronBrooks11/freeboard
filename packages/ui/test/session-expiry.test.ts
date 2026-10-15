import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";

import { ApolloClient, ApolloLink, HttpLink, InMemoryCache, gql } from "@apollo/client/core";
import type { Client, RequestParams } from "graphql-sse";
import { createPinia, setActivePinia } from "pinia";

import { buildGraphQLRequestHeaders, createAuthErrorLink } from "../src/apolloAuthError.js";
import { SSELink } from "../src/sse.js";
import { useAuthStore } from "../src/stores/auth.js";
import { clearRuntimeExecutionMode } from "../src/executionPolicy.js";

// #301: the API answers a request whose bearer token no longer authenticates
// with this result, on both the HTTP and the SSE transport.
const UNAUTHENTICATED_RESULT = {
  data: null,
  errors: [
    {
      message: "Your session has expired or is no longer valid. Log in again.",
      extensions: { code: "UNAUTHENTICATED" },
    },
  ],
};

const DASHBOARD_SUBSCRIPTION = gql`
  subscription onDashboardUpdated($id: ID!) {
    dashboard(_id: $id) {
      _id
    }
  }
`;

const DASHBOARD_QUERY = gql`
  query DashboardRead($id: ID!) {
    dashboard(_id: $id) {
      _id
    }
  }
`;

const LOGIN_MUTATION = gql`
  mutation Login($email: String!, $password: String!) {
    authUser(email: $email, password: $password) {
      token
    }
  }
`;

const sseLinkEmitting = (result: unknown) => {
  const link = new SSELink({ url: "http://localhost/graphql" });
  link.client = {
    subscribe: (
      _params: RequestParams,
      sink: { next: (value: unknown) => void; complete: () => void },
    ) => {
      sink.next(result);
      sink.complete();
      return () => {};
    },
  } as unknown as Client;
  return link;
};

const jsonResponse = (body: unknown) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json; charset=utf-8" },
  });

// The link chain main.ts builds: the auth error link in front of the transport.
const clientWith = (transport: ApolloLink, onAuthFailure: () => void) =>
  new ApolloClient({
    link: ApolloLink.from([createAuthErrorLink(onAuthFailure), transport]),
    cache: new InMemoryCache(),
  });

// Collect what a component's subscription handler sees for each result.
const collectSubscription = (client: ApolloClient) =>
  new Promise<Array<{ data?: unknown }>>((resolve, reject) => {
    const received: Array<{ data?: unknown }> = [];
    client.subscribe({ query: DASHBOARD_SUBSCRIPTION, variables: { id: "dash-1" } }).subscribe({
      next: (value) => received.push(value as { data?: unknown }),
      complete: () => resolve(received),
      error: reject,
    });
  });

test("an UNAUTHENTICATED subscription result ends the session and carries no dashboard data", async () => {
  let authFailures = 0;
  const client = clientWith(sseLinkEmitting(UNAUTHENTICATED_RESULT), () => {
    authFailures += 1;
  });

  const received = await collectSubscription(client);

  assert.equal(authFailures, 1);
  // Freeboard.vue only raises the access-lost banner for a result with data
  // (the server's terminal `{ dashboard: null }`), so this result is skipped.
  assert.equal(received.length, 1);
  assert.ok(!received[0]?.data, `expected no data, got ${JSON.stringify(received[0]?.data)}`);
});

test("the server's terminal null still reaches the subscription handler without ending the session", async () => {
  let authFailures = 0;
  const client = clientWith(sseLinkEmitting({ data: { dashboard: null } }), () => {
    authFailures += 1;
  });

  const received = await collectSubscription(client);

  assert.equal(authFailures, 0);
  assert.deepEqual(received[0]?.data, { dashboard: null });
});

test("an UNAUTHENTICATED HTTP query result at status 200 ends the session", async () => {
  let authFailures = 0;
  const httpLink = new HttpLink({
    uri: "http://localhost/graphql",
    fetch: async () => jsonResponse(UNAUTHENTICATED_RESULT),
  });
  const client = clientWith(httpLink, () => {
    authFailures += 1;
  });

  const result = await client.query({ query: DASHBOARD_QUERY, variables: { id: "dash-1" } }).then(
    (value) => ({ error: value.error }),
    (error: unknown) => ({ error }),
  );

  assert.ok(result.error);
  assert.equal(authFailures, 1);
});

// --- A stored token that expired before the page loaded ---

const createStorage = () => {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => (data.has(key) ? (data.get(key) as string) : null),
    setItem: (key: string, value: string) => {
      data.set(key, String(value));
    },
    removeItem: (key: string) => {
      data.delete(key);
    },
    clear: () => data.clear(),
  };
};

const encodeToken = (payload: Record<string, unknown>) =>
  `header.${Buffer.from(JSON.stringify(payload)).toString("base64url")}.signature`;

const originalSessionStorage = globalThis.sessionStorage;
const originalLocalStorage = globalThis.localStorage;

beforeEach(() => {
  setActivePinia(createPinia());
  globalThis.sessionStorage = createStorage() as unknown as Storage;
  globalThis.localStorage = createStorage() as unknown as Storage;
  clearRuntimeExecutionMode();
});

afterEach(() => {
  clearRuntimeExecutionMode();
  globalThis.sessionStorage = originalSessionStorage;
  globalThis.localStorage = originalLocalStorage;
});

test("logging in works when the stored token has expired", async () => {
  const expired = encodeToken({
    _id: "user-1",
    email: "owner@example.com",
    role: "editor",
    active: true,
    exp: Math.floor(Date.now() / 1000) - 60,
  });
  globalThis.sessionStorage.setItem("freeboard", JSON.stringify({ token: expired }));

  const store = useAuthStore();
  // The page-load sequence from bootstrap/appBootstrap.ts.
  store.loadSession();
  store.hydrateFromToken();
  store.dropExpiredToken();

  assert.equal(store.token, null);
  assert.equal(store.isLoggedIn(), false);
  assert.equal(store.sessionExpired, true);

  // A server that rejects any request still carrying a bearer token, as the
  // API does for an expired one.
  const sentAuthorization: Array<string | null> = [];
  const httpLink = new HttpLink({
    uri: "http://localhost/graphql",
    fetch: async () => {
      // Same header source as main.ts's HttpLink.
      const headers = buildGraphQLRequestHeaders(store.token);
      sentAuthorization.push(headers["Authorization"] ?? null);
      return headers["Authorization"]
        ? jsonResponse(UNAUTHENTICATED_RESULT)
        : jsonResponse({ data: { authUser: { __typename: "Token", token: "fresh-token" } } });
    },
  });
  let authFailures = 0;
  const client = clientWith(httpLink, () => {
    authFailures += 1;
  });

  const result = await client.mutate({
    mutation: LOGIN_MUTATION,
    variables: { email: "owner@example.com", password: "StrongPass123!" },
  });

  assert.deepEqual(sentAuthorization, [null]);
  assert.equal(authFailures, 0);
  assert.equal(
    (result.data as { authUser?: { token?: string } } | undefined)?.authUser?.token,
    "fresh-token",
  );

  store.login(encodeToken({ _id: "user-1", role: "editor", active: true }));
  assert.equal(store.sessionExpired, false);
});

test("expireSession flags the notice only when there was a session", () => {
  const store = useAuthStore();

  store.expireSession();
  assert.equal(store.sessionExpired, false);

  store.login(encodeToken({ _id: "user-1", role: "editor", active: true }));
  store.expireSession();
  assert.equal(store.token, null);
  assert.equal(store.sessionExpired, true);

  store.logout();
  assert.equal(store.sessionExpired, false);
});

test("dropExpiredToken keeps a token that has not expired", () => {
  const store = useAuthStore();
  store.login(
    encodeToken({
      _id: "user-1",
      role: "editor",
      active: true,
      exp: Math.floor(Date.now() / 1000) + 3600,
    }),
  );

  assert.equal(store.dropExpiredToken(), false);
  assert.equal(store.isLoggedIn(), true);
  assert.equal(store.sessionExpired, false);
});
