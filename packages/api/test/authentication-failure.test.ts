import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { createYoga } from "graphql-yoga";
import { useGraphQLSSE } from "@graphql-yoga/plugin-graphql-sse";
import { createClient } from "graphql-sse";

import schema from "../src/gql.js";
import { createAuthToken } from "../src/auth.js";
import { config } from "../src/config.js";
import { setContext, useRejectFailedAuthentication } from "../src/context.js";
import { dataStore } from "../src/data/index.js";
import { resetLoginThrottleState } from "../src/loginThrottle.js";
import { useOperationLimits } from "../src/security/operationLimits.js";

// #301: a request that presents a bearer token which no longer authenticates must
// get UNAUTHENTICATED on every transport the API serves, not continue as
// anonymous. Requests with no Authorization header stay anonymous.

const userRepository = dataStore.repositories.users;
const dashboardRepository = dataStore.repositories.dashboards;
const policyRepository = dataStore.repositories.policy;
const auditRepository = dataStore.repositories.audit;

const originalMethods = {
  userFindActiveById: userRepository.findActiveById,
  userFindByEmail: userRepository.findByEmail,
  userTouchLastLogin: userRepository.touchLastLogin,
  dashboardFindById: dashboardRepository.findById,
  policyReadValue: policyRepository.readValue,
  auditIsReady: auditRepository.isReady,
};

const PASSWORD = "StrongPass123!";
const persistedUser = {
  _id: "user-1",
  email: "owner@example.com",
  password: bcrypt.hashSync(PASSWORD, 4),
  role: "editor",
  active: true,
  sessionVersion: 2,
  registrationDate: new Date("2026-01-01T00:00:00.000Z"),
  lastLogin: new Date("2026-01-01T00:00:00.000Z"),
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
};

const buildDashboardDoc = (visibility: string) => ({
  _id: "dash-1",
  visibility,
  shareToken: "share-token-1",
  shareTokenVersion: 0,
  acl: [],
  user: "user-1",
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  document: {
    schemaVersion: 1,
    title: "Main",
    image: null,
    columns: 3,
    width: "md",
    datasources: [],
    panes: [],
    settings: { theme: "auto" },
  },
});

let dashboardVisibility = "private";

beforeEach(() => {
  dashboardVisibility = "private";
  auditRepository.isReady = () => false;
  policyRepository.readValue = async () => null;
  userRepository.findActiveById = async ({ userId }) =>
    userId === persistedUser._id ? persistedUser : null;
  userRepository.findByEmail = async ({ email }) =>
    email === persistedUser.email ? persistedUser : null;
  userRepository.touchLastLogin = async () => {};
  dashboardRepository.findById = async ({ dashboardId }) =>
    dashboardId === "dash-1" ? buildDashboardDoc(dashboardVisibility) : null;
});

afterEach(() => {
  userRepository.findActiveById = originalMethods.userFindActiveById;
  userRepository.findByEmail = originalMethods.userFindByEmail;
  userRepository.touchLastLogin = originalMethods.userTouchLastLogin;
  dashboardRepository.findById = originalMethods.dashboardFindById;
  policyRepository.readValue = originalMethods.policyReadValue;
  auditRepository.isReady = originalMethods.auditIsReady;
  resetLoginThrottleState();
});

const validToken = () => createAuthToken(persistedUser.email, "editor", true, "user-1", 2);

const expiredToken = () => {
  const nowSeconds = Math.floor(Date.now() / 1000);
  return jwt.sign(
    {
      _id: "user-1",
      email: persistedUser.email,
      role: "editor",
      sv: 2,
      iat: nowSeconds - 7200,
    },
    config.jwtSecret,
    { expiresIn: 60 },
  );
};

// Same context factory and plugin list as src/index.ts.
const startServer = async () => {
  const yoga = createYoga({
    schema,
    context: setContext,
    logging: false,
    plugins: [useGraphQLSSE(), useOperationLimits(), useRejectFailedAuthentication()],
  });
  const server = createServer((req, res) => {
    yoga(req, res);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    origin: `http://127.0.0.1:${port}`,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
};

const DASHBOARD_QUERY = `query DashboardRead($id: ID!) { dashboard(_id: $id) { _id } }`;
const DASHBOARD_SUBSCRIPTION = `subscription DashboardSub($id: ID!) { dashboard(_id: $id) { _id } }`;

type GraphQLBody = {
  data?: Record<string, unknown> | null;
  errors?: Array<{ message?: string; extensions?: { code?: string } }>;
};

// The UI's HttpLink replaces the request headers, so it sends no Accept header.
const postQuery = async (
  origin: string,
  body: Record<string, unknown>,
  authorization?: string,
): Promise<{ status: number; json: GraphQLBody }> => {
  const response = await fetch(`${origin}/graphql`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(authorization ? { authorization } : {}),
    },
    body: JSON.stringify(body),
  });
  return { status: response.status, json: (await response.json()) as GraphQLBody };
};

// Read an SSE response until it completes (the error result is a single event).
const readEventStream = async (response: Response): Promise<string> => {
  const reader = (response.body as ReadableStream<Uint8Array>).getReader();
  const decoder = new TextDecoder();
  let text = "";
  const deadline = Date.now() + 3000;
  while (Date.now() < deadline) {
    const { value, done } = await reader.read();
    if (done) {
      break;
    }
    text += decoder.decode(value, { stream: true });
    if (text.includes("event: complete")) {
      break;
    }
  }
  await reader.cancel().catch(() => {});
  return text;
};

const firstNextPayload = (text: string): GraphQLBody => {
  const match = text.match(/event: next\ndata: (.*)\n/);
  assert.ok(match, `expected an SSE next event, got ${JSON.stringify(text)}`);
  return JSON.parse(match[1]) as GraphQLBody;
};

for (const [label, authorization] of [
  ["an expired JWT", () => `Bearer ${expiredToken()}`],
  ["a garbage token", () => "Bearer not-a-jwt"],
  [
    "a JWT whose sessionVersion was revoked",
    () => `Bearer ${createAuthToken(persistedUser.email, "editor", true, "user-1", 1)}`,
  ],
] as const) {
  test(`HTTP query with ${label} gets UNAUTHENTICATED at HTTP 200`, async () => {
    const server = await startServer();
    try {
      const { status, json } = await postQuery(
        server.origin,
        { query: DASHBOARD_QUERY, variables: { id: "dash-1" } },
        authorization(),
      );
      assert.equal(status, 200);
      assert.equal(json.data ?? null, null);
      assert.equal(json.errors?.[0]?.extensions?.code, "UNAUTHENTICATED");
    } finally {
      await server.close();
    }
  });
}

test("SSE subscription on /graphql with an expired JWT emits UNAUTHENTICATED and completes", async () => {
  const server = await startServer();
  try {
    const response = await fetch(`${server.origin}/graphql`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "text/event-stream",
        authorization: `Bearer ${expiredToken()}`,
      },
      body: JSON.stringify({ query: DASHBOARD_SUBSCRIPTION, variables: { id: "dash-1" } }),
    });
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type") ?? "", /text\/event-stream/);
    const text = await readEventStream(response);
    assert.equal(firstNextPayload(text).errors?.[0]?.extensions?.code, "UNAUTHENTICATED");
    assert.match(text, /event: complete/);
  } finally {
    await server.close();
  }
});

test("SSE subscription on /graphql/stream with an expired JWT emits UNAUTHENTICATED, not HTTP 500", async () => {
  const server = await startServer();
  try {
    const response = await fetch(`${server.origin}/graphql/stream`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "text/event-stream",
        authorization: `Bearer ${expiredToken()}`,
      },
      body: JSON.stringify({ query: DASHBOARD_SUBSCRIPTION, variables: { id: "dash-1" } }),
    });
    assert.equal(response.status, 200);
    const text = await readEventStream(response);
    assert.equal(firstNextPayload(text).errors?.[0]?.extensions?.code, "UNAUTHENTICATED");
  } finally {
    await server.close();
  }
});

test("graphql-sse client (the UI's subscription transport) receives UNAUTHENTICATED as a result, not a network error", async () => {
  const server = await startServer();
  const client = createClient({
    url: `${server.origin}/graphql`,
    fetchFn: fetch,
    retryAttempts: 0,
    headers: { authorization: `Bearer ${expiredToken()}` },
  });
  try {
    const result = await new Promise<GraphQLBody>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("timed out waiting for SSE result")), 4000);
      client.subscribe(
        { query: DASHBOARD_SUBSCRIPTION, variables: { id: "dash-1" } },
        {
          next: (value) => {
            clearTimeout(timer);
            resolve(value as GraphQLBody);
          },
          error: (error) => {
            clearTimeout(timer);
            reject(error instanceof Error ? error : new Error(String(error)));
          },
          complete: () => {},
        },
      );
    });
    assert.equal(result.errors?.[0]?.extensions?.code, "UNAUTHENTICATED");
  } finally {
    await client.dispose();
    await server.close();
  }
});

test("a request without an Authorization header stays anonymous and can read a public dashboard", async () => {
  dashboardVisibility = "public";
  const server = await startServer();
  try {
    const { status, json } = await postQuery(server.origin, {
      query: DASHBOARD_QUERY,
      variables: { id: "dash-1" },
    });
    assert.equal(status, 200);
    assert.equal(json.errors, undefined);
    assert.deepEqual(json.data, { dashboard: { _id: "dash-1" } });
  } finally {
    await server.close();
  }
});

test("a valid token reads its owner's private dashboard", async () => {
  const server = await startServer();
  try {
    const { json } = await postQuery(
      server.origin,
      { query: DASHBOARD_QUERY, variables: { id: "dash-1" } },
      `Bearer ${validToken()}`,
    );
    assert.equal(json.errors, undefined);
    assert.deepEqual(json.data, { dashboard: { _id: "dash-1" } });
  } finally {
    await server.close();
  }
});

const LOGIN_MUTATION = `mutation Login($email: String!, $password: String!) { authUser(email: $email, password: $password) { token } }`;

test("login works once the client drops a stale token, and is refused while it still sends it", async () => {
  const server = await startServer();
  try {
    const variables = { email: persistedUser.email, password: PASSWORD };

    const withStale = await postQuery(
      server.origin,
      { query: LOGIN_MUTATION, variables },
      `Bearer ${expiredToken()}`,
    );
    assert.equal(withStale.json.errors?.[0]?.extensions?.code, "UNAUTHENTICATED");

    const withoutHeader = await postQuery(server.origin, { query: LOGIN_MUTATION, variables });
    assert.equal(withoutHeader.json.errors, undefined);
    const token = (withoutHeader.json.data?.authUser as { token?: string } | undefined)?.token;
    assert.ok(token, "expected a fresh token");
  } finally {
    await server.close();
  }
});
