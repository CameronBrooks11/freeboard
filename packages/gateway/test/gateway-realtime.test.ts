import assert from "node:assert/strict";
import crypto from "node:crypto";
import { EventEmitter } from "node:events";
import { createServer } from "node:http";
import { test } from "node:test";
import jwt from "jsonwebtoken";
import WebSocket from "ws";
import { getGatewayRuntimeMetricsSnapshot } from "../src/runtimeMetrics.js";

const JWT_GATEWAY_SECRET = "freeboard-gateway-dev-insecure-local-only-secret-32";
const GATEWAY_SERVICE_TOKEN = "freeboard-gateway-service-dev-token-local-only-32";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const makeJsonResponse = (status, payload) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => payload,
});

const createStreamToken = ({
  sub = "user-1",
  dashboardId = "dash-rt-1",
  datasourceId = "ds-rt-1",
  shareTokenVersion = null,
  expiresIn = "5m",
} = {}) =>
  jwt.sign(
    {
      iss: "freeboard-api",
      aud: "freeboard-gateway",
      sub,
      scope: "datasource:stream",
      dashboardId,
      datasourceId,
      ...(shareTokenVersion !== null ? { shareTokenVersion } : {}),
    },
    JWT_GATEWAY_SECRET,
    { algorithm: "HS256", expiresIn },
  );

class FakeUpstreamWebSocket extends EventEmitter {
  static OPEN = 1;

  static CLOSED = 3;

  readyState = 0;

  constructor({ messagePayload = null } = {}) {
    super();
    this.messagePayload = messagePayload;

    setTimeout(() => {
      this.readyState = FakeUpstreamWebSocket.OPEN;
      this.emit("open");

      if (this.messagePayload !== null) {
        setTimeout(() => {
          if (this.readyState === FakeUpstreamWebSocket.OPEN) {
            this.emit("message", Buffer.from(JSON.stringify(this.messagePayload), "utf8"), false);
          }
        }, 5);
      }
    }, 0);
  }

  ping() {
    if (this.readyState === FakeUpstreamWebSocket.OPEN) {
      this.emit("pong");
    }
  }

  close() {
    if (this.readyState === FakeUpstreamWebSocket.CLOSED) {
      return;
    }
    this.readyState = FakeUpstreamWebSocket.CLOSED;
    this.emit("close");
  }

  terminate() {
    this.close();
  }
}

const waitForMessage = async (messages, predicate, timeoutMs = 2000) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const match = messages.find(predicate);
    if (match) {
      return match;
    }
    await sleep(10);
  }

  throw new Error(`Timed out waiting for realtime message. Received: ${JSON.stringify(messages)}`);
};

const hashLimiterKeyPart = (value: unknown): string =>
  crypto
    .createHash("sha256")
    .update(
      String(value || "")
        .trim()
        .toLowerCase(),
    )
    .digest("hex")
    .slice(0, 32);

const parseJsonBody = (options: unknown): Record<string, unknown> => {
  if (!options || typeof options !== "object") {
    return {};
  }
  const body = (options as { body?: unknown }).body;
  if (typeof body !== "string" || !body.trim()) {
    return {};
  }
  try {
    return JSON.parse(body) as Record<string, unknown>;
  } catch {
    return {};
  }
};

const createSharedFixedWindowLimiter = () => {
  const buckets = new Map<string, { bucketId: number; count: number }>();
  const fixedBucketId = Math.floor(Date.now() / 60_000);

  return ({
    scope,
    key,
    limitPerMinute,
    scopeLimits = {},
  }: {
    scope: string;
    key: string;
    limitPerMinute: number;
    scopeLimits?: Record<string, number>;
  }) => {
    const configuredScopeLimit = scopeLimits[scope];
    const safeLimit = Math.max(
      1,
      Math.floor(
        Number(Number.isFinite(configuredScopeLimit) ? configuredScopeLimit : limitPerMinute) || 1,
      ),
    );
    const storageKey = `${scope}:${key}`;
    const current = buckets.get(storageKey);
    const nextCount = current && current.bucketId === fixedBucketId ? current.count + 1 : 1;
    buckets.set(storageKey, {
      bucketId: fixedBucketId,
      count: nextCount,
    });

    const allowed = nextCount <= safeLimit;
    return {
      allowed,
      retryAfterMs: allowed ? 0 : 1000,
      remaining: allowed ? Math.max(0, safeLimit - nextCount) : 0,
      reason: allowed ? "allowed" : "limited",
    };
  };
};

const connectRealtimeClient = async (
  port: number,
  { headers = {} }: { headers?: Record<string, string> } = {},
) => {
  const client = new WebSocket(`ws://127.0.0.1:${port}/gateway/realtime`, {
    headers,
  });
  const messages = [];

  client.on("message", (rawPayload) => {
    try {
      messages.push(JSON.parse(String(rawPayload || "")));
    } catch {
      // Ignore malformed payloads in tests.
    }
  });

  await new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error("Timed out opening realtime websocket client"));
    }, 1500);

    client.once("open", () => {
      clearTimeout(timeoutId);
      resolve();
    });
    client.once("error", (error) => {
      clearTimeout(timeoutId);
      reject(error);
    });
  });

  return { client, messages };
};

const closeRealtimeHarness = async ({ client, gateway, server }) => {
  if (client) {
    if (client.readyState === WebSocket.OPEN || client.readyState === WebSocket.CONNECTING) {
      client.close();
      await new Promise((resolve) => {
        const timeoutId = setTimeout(resolve, 500);
        client.once("close", () => {
          clearTimeout(timeoutId);
          resolve();
        });
      });
    }
  }

  if (gateway) {
    await gateway.close();
  }

  if (server?.listening) {
    await new Promise((resolve) => {
      server.close(() => resolve());
    });
  }
};

const loadRealtimeGatewayModule = async ({
  realtimePublicRevalidateIntervalMs = 25,
  realtimePublicFullRevalidateIntervalMs = 300,
  realtimeWsPingIntervalMs = 30,
  realtimeLimiterFailureMode = "fail-open",
  realtimeConnectRateLimitIpPerMin = 60,
  realtimePublicSubscribeRateLimitIpPerMin = 60,
  realtimePublicSubscribeRateLimitShareTokenPerMin = 120,
} = {}) => {
  process.env.NODE_ENV = "test";
  process.env.JWT_GATEWAY_SECRET = JWT_GATEWAY_SECRET;
  process.env.GATEWAY_SERVICE_TOKEN = GATEWAY_SERVICE_TOKEN;
  process.env.REALTIME_ENABLED = "true";
  process.env.REALTIME_LIMITER_FAILURE_MODE = String(realtimeLimiterFailureMode);
  process.env.REALTIME_PUBLIC_REVALIDATE_INTERVAL_MS = String(realtimePublicRevalidateIntervalMs);
  process.env.REALTIME_PUBLIC_FULL_REVALIDATE_INTERVAL_MS = String(
    realtimePublicFullRevalidateIntervalMs,
  );
  process.env.REALTIME_WS_PING_INTERVAL_MS = String(realtimeWsPingIntervalMs);
  process.env.REALTIME_CONNECT_RATE_LIMIT_IP_PER_MIN = String(realtimeConnectRateLimitIpPerMin);
  process.env.REALTIME_PUBLIC_SUBSCRIBE_RATE_LIMIT_IP_PER_MIN = String(
    realtimePublicSubscribeRateLimitIpPerMin,
  );
  process.env.REALTIME_PUBLIC_SUBSCRIBE_RATE_LIMIT_SHARE_TOKEN_PER_MIN = String(
    realtimePublicSubscribeRateLimitShareTokenPerMin,
  );

  const moduleUrl = new URL("../src/index.js", import.meta.url);
  moduleUrl.searchParams.set("testRun", `${Date.now()}-${Math.random()}`);
  return import(moduleUrl.href);
};

const expectRealtimeHandshakeStatus = async (
  port: number,
  expectedStatusCode: number,
  { headers = {} }: { headers?: Record<string, string> } = {},
) =>
  new Promise((resolve, reject) => {
    const client = new WebSocket(`ws://127.0.0.1:${port}/gateway/realtime`, {
      headers,
    });
    const timeoutId = setTimeout(() => {
      reject(new Error("Timed out waiting for realtime handshake response"));
    }, 2000);

    client.once("unexpected-response", (_request, response) => {
      clearTimeout(timeoutId);
      const statusCode = Number(response.statusCode || 0);
      if (statusCode !== expectedStatusCode) {
        reject(new Error(`Expected handshake ${expectedStatusCode}, received ${statusCode}`));
        return;
      }
      response.resume();
      client.terminate();
      resolve(statusCode);
    });
    client.once("open", () => {
      clearTimeout(timeoutId);
      client.close();
      reject(new Error("Expected handshake failure but websocket opened"));
    });
    client.once("error", () => {
      // `unexpected-response` is authoritative for these handshake tests.
    });
  });

test("realtime gateway websocket subscribe/unsubscribe lifecycle emits ack, status, and data", async () => {
  const { createRealtimeGateway } = await loadRealtimeGatewayModule();
  const upstreamSockets = [];

  const fetchStub = async (url) => {
    const normalizedUrl = String(url || "");
    if (normalizedUrl.endsWith("/internal/gateway/rate-limit/consume")) {
      return makeJsonResponse(200, {
        allowed: true,
        retryAfterMs: 0,
        remaining: 100,
        reason: "allowed",
      });
    }
    if (normalizedUrl.endsWith("/internal/gateway/datasource-introspect")) {
      return makeJsonResponse(200, {
        scope: "datasource:stream",
        intent: {
          protocol: "websocket",
          url: "ws://example.com/stream",
          parser: "json",
          headers: {},
          protocols: [],
          idleTimeoutMs: 1000,
        },
      });
    }
    if (normalizedUrl.endsWith("/internal/gateway/revoked-tokens")) {
      return makeJsonResponse(200, {
        events: [],
        nextCursor: "cursor-empty",
        cursorExpired: false,
      });
    }
    throw new Error(`Unexpected fetch URL in test: ${normalizedUrl}`);
  };

  const server = createServer((_req, res) => {
    res.statusCode = 404;
    res.end();
  });
  const gateway = createRealtimeGateway({
    server,
    lookup: async () => [{ address: "93.184.216.34", family: 4 }],
    fetchFn: fetchStub,
    wsClientFactory: () => {
      const socket = new FakeUpstreamWebSocket({
        messagePayload: { value: 42 },
      });
      upstreamSockets.push(socket);
      return socket;
    },
  });

  let client;
  try {
    await new Promise((resolve) => {
      server.listen(0, "127.0.0.1", resolve);
    });
    const port = server.address().port;

    const connection = await connectRealtimeClient(port);
    client = connection.client;
    const { messages } = connection;
    const sessionToken = createStreamToken({
      sub: "editor-1",
      dashboardId: "dash-rt-1",
      datasourceId: "ds-rt-1",
    });

    client.send(
      JSON.stringify({
        type: "subscribe",
        requestId: "sub-1",
        dashboardId: "dash-rt-1",
        datasourceId: "ds-rt-1",
        sessionToken,
      }),
    );

    const subscribeAck = await waitForMessage(
      messages,
      (message) => message.type === "ack" && message.requestId === "sub-1",
    );
    assert.equal(subscribeAck.ok, true);

    const connectedStatus = await waitForMessage(
      messages,
      (message) =>
        message.type === "status" &&
        message.datasourceId === "ds-rt-1" &&
        message.status === "connected",
    );
    assert.equal(connectedStatus.errorCode, undefined);

    const dataMessage = await waitForMessage(
      messages,
      (message) => message.type === "data" && message.datasourceId === "ds-rt-1",
    );
    assert.deepEqual(dataMessage.payload, { value: 42 });

    client.send(
      JSON.stringify({
        type: "unsubscribe",
        requestId: "unsub-1",
        datasourceId: "ds-rt-1",
      }),
    );

    const unsubscribeAck = await waitForMessage(
      messages,
      (message) => message.type === "ack" && message.requestId === "unsub-1",
    );
    assert.equal(unsubscribeAck.ok, true);

    const disconnectedStatus = await waitForMessage(
      messages,
      (message) =>
        message.type === "status" &&
        message.datasourceId === "ds-rt-1" &&
        message.status === "disconnected",
    );
    assert.equal(disconnectedStatus.status, "disconnected");
    assert.equal(upstreamSockets.length > 0, true);
  } finally {
    await closeRealtimeHarness({ client, gateway, server });
  }
});

test("realtime gateway disconnects stale public subscriptions from revoked feed events", async () => {
  const { createRealtimeGateway } = await loadRealtimeGatewayModule({
    realtimePublicRevalidateIntervalMs: 20,
    realtimePublicFullRevalidateIntervalMs: 500,
  });

  let revokedFeedCalls = 0;
  const fetchStub = async (url) => {
    const normalizedUrl = String(url || "");
    if (normalizedUrl.endsWith("/internal/gateway/rate-limit/consume")) {
      return makeJsonResponse(200, {
        allowed: true,
        retryAfterMs: 0,
        remaining: 100,
        reason: "allowed",
      });
    }
    if (normalizedUrl.endsWith("/internal/gateway/datasource-introspect")) {
      return makeJsonResponse(200, {
        scope: "datasource:stream",
        intent: {
          protocol: "websocket",
          url: "ws://example.com/stream",
          parser: "json",
          headers: {},
          protocols: [],
          idleTimeoutMs: 1000,
        },
      });
    }

    if (normalizedUrl.endsWith("/internal/gateway/revoked-tokens")) {
      revokedFeedCalls += 1;
      if (revokedFeedCalls === 1) {
        return makeJsonResponse(200, {
          events: [
            {
              eventId: "evt-1",
              dashboardId: "dash-public-1",
              shareTokenVersion: 2,
              revokedAt: new Date().toISOString(),
            },
          ],
          nextCursor: "cursor-1",
          cursorExpired: false,
        });
      }

      return makeJsonResponse(200, {
        events: [],
        nextCursor: `cursor-${revokedFeedCalls}`,
        cursorExpired: false,
      });
    }

    throw new Error(`Unexpected fetch URL in test: ${normalizedUrl}`);
  };

  const server = createServer((_req, res) => {
    res.statusCode = 404;
    res.end();
  });
  const gateway = createRealtimeGateway({
    server,
    lookup: async () => [{ address: "93.184.216.34", family: 4 }],
    fetchFn: fetchStub,
    wsClientFactory: () => new FakeUpstreamWebSocket(),
  });

  let client;
  try {
    await new Promise((resolve) => {
      server.listen(0, "127.0.0.1", resolve);
    });
    const port = server.address().port;

    const connection = await connectRealtimeClient(port);
    client = connection.client;
    const { messages } = connection;
    const publicSessionToken = createStreamToken({
      sub: "public",
      dashboardId: "dash-public-1",
      datasourceId: "ds-public-1",
      shareTokenVersion: 1,
    });

    client.send(
      JSON.stringify({
        type: "subscribe",
        requestId: "sub-public-1",
        dashboardId: "dash-public-1",
        datasourceId: "ds-public-1",
        sessionToken: publicSessionToken,
      }),
    );

    const subscribeAck = await waitForMessage(
      messages,
      (message) => message.type === "ack" && message.requestId === "sub-public-1",
    );
    assert.equal(subscribeAck.ok, true);

    const revokeError = await waitForMessage(
      messages,
      (message) =>
        message.type === "error" &&
        message.datasourceId === "ds-public-1" &&
        message.errorCode === "STREAM_AUTH_FAILED",
    );
    assert.match(String(revokeError.message || ""), /revoked/i);
    assert.equal(revokedFeedCalls >= 1, true);
  } finally {
    await closeRealtimeHarness({ client, gateway, server });
  }
});

test("realtime gateway runs full revalidation when revocation cursor expires", async () => {
  const { createRealtimeGateway } = await loadRealtimeGatewayModule({
    realtimePublicRevalidateIntervalMs: 20,
    realtimePublicFullRevalidateIntervalMs: 500,
  });

  let introspectionCalls = 0;
  let revokedFeedCalls = 0;
  const fetchStub = async (url) => {
    const normalizedUrl = String(url || "");
    if (normalizedUrl.endsWith("/internal/gateway/rate-limit/consume")) {
      return makeJsonResponse(200, {
        allowed: true,
        retryAfterMs: 0,
        remaining: 100,
        reason: "allowed",
      });
    }

    if (normalizedUrl.endsWith("/internal/gateway/datasource-introspect")) {
      introspectionCalls += 1;

      if (introspectionCalls === 1) {
        return makeJsonResponse(200, {
          scope: "datasource:stream",
          intent: {
            protocol: "websocket",
            url: "ws://example.com/stream",
            parser: "json",
            headers: {},
            protocols: [],
            idleTimeoutMs: 1000,
          },
        });
      }

      return makeJsonResponse(403, {
        error: "Share token is stale",
      });
    }

    if (normalizedUrl.endsWith("/internal/gateway/revoked-tokens")) {
      revokedFeedCalls += 1;
      if (revokedFeedCalls === 1) {
        return makeJsonResponse(200, {
          events: [],
          nextCursor: "cursor-expired-1",
          cursorExpired: true,
        });
      }

      return makeJsonResponse(200, {
        events: [],
        nextCursor: `cursor-expired-${revokedFeedCalls}`,
        cursorExpired: false,
      });
    }

    throw new Error(`Unexpected fetch URL in test: ${normalizedUrl}`);
  };

  const server = createServer((_req, res) => {
    res.statusCode = 404;
    res.end();
  });
  const gateway = createRealtimeGateway({
    server,
    lookup: async () => [{ address: "93.184.216.34", family: 4 }],
    fetchFn: fetchStub,
    wsClientFactory: () => new FakeUpstreamWebSocket(),
  });

  let client;
  try {
    await new Promise((resolve) => {
      server.listen(0, "127.0.0.1", resolve);
    });
    const port = server.address().port;

    const connection = await connectRealtimeClient(port);
    client = connection.client;
    const { messages } = connection;
    const publicSessionToken = createStreamToken({
      sub: "public",
      dashboardId: "dash-public-2",
      datasourceId: "ds-public-2",
      shareTokenVersion: 5,
    });

    client.send(
      JSON.stringify({
        type: "subscribe",
        requestId: "sub-public-2",
        dashboardId: "dash-public-2",
        datasourceId: "ds-public-2",
        sessionToken: publicSessionToken,
      }),
    );

    const subscribeAck = await waitForMessage(
      messages,
      (message) => message.type === "ack" && message.requestId === "sub-public-2",
    );
    assert.equal(subscribeAck.ok, true);

    const revokeError = await waitForMessage(
      messages,
      (message) =>
        message.type === "error" &&
        message.datasourceId === "ds-public-2" &&
        message.errorCode === "STREAM_AUTH_FAILED",
    );
    assert.match(String(revokeError.message || ""), /revoked/i);
    assert.equal(introspectionCalls >= 2, true);
    assert.equal(revokedFeedCalls >= 1, true);
  } finally {
    await closeRealtimeHarness({ client, gateway, server });
  }
});

test("realtime websocket handshake fails closed when limiter backend is unavailable", async () => {
  const { createRealtimeGateway } = await loadRealtimeGatewayModule({
    realtimeLimiterFailureMode: "fail-closed",
  });

  const fetchStub = async (url) => {
    const normalizedUrl = String(url || "");
    if (normalizedUrl.endsWith("/internal/gateway/rate-limit/consume")) {
      return makeJsonResponse(503, {
        error: "Security limiter unavailable",
      });
    }
    if (normalizedUrl.endsWith("/internal/gateway/revoked-tokens")) {
      return makeJsonResponse(200, {
        events: [],
        nextCursor: "cursor-empty",
        cursorExpired: false,
      });
    }
    throw new Error(`Unexpected fetch URL in test: ${normalizedUrl}`);
  };

  const server = createServer((_req, res) => {
    res.statusCode = 404;
    res.end();
  });
  const gateway = createRealtimeGateway({
    server,
    lookup: async () => [{ address: "93.184.216.34", family: 4 }],
    fetchFn: fetchStub,
    wsClientFactory: () => new FakeUpstreamWebSocket(),
  });

  try {
    await new Promise((resolve) => {
      server.listen(0, "127.0.0.1", resolve);
    });
    const port = Number(server.address()?.port || 0);
    await expectRealtimeHandshakeStatus(port, 503);
  } finally {
    await closeRealtimeHarness({ gateway, server });
  }
});

test("realtime websocket handshake allows fail-open limiter policy during backend outage", async () => {
  const { createRealtimeGateway } = await loadRealtimeGatewayModule({
    realtimeLimiterFailureMode: "fail-open",
  });

  const fetchStub = async (url) => {
    const normalizedUrl = String(url || "");
    if (normalizedUrl.endsWith("/internal/gateway/rate-limit/consume")) {
      return makeJsonResponse(503, {
        error: "Security limiter unavailable",
      });
    }
    if (normalizedUrl.endsWith("/internal/gateway/revoked-tokens")) {
      return makeJsonResponse(200, {
        events: [],
        nextCursor: "cursor-empty",
        cursorExpired: false,
      });
    }
    throw new Error(`Unexpected fetch URL in test: ${normalizedUrl}`);
  };

  const server = createServer((_req, res) => {
    res.statusCode = 404;
    res.end();
  });
  const gateway = createRealtimeGateway({
    server,
    lookup: async () => [{ address: "93.184.216.34", family: 4 }],
    fetchFn: fetchStub,
    wsClientFactory: () => new FakeUpstreamWebSocket(),
  });

  let client;
  try {
    await new Promise((resolve) => {
      server.listen(0, "127.0.0.1", resolve);
    });
    const port = Number(server.address()?.port || 0);
    const connection = await connectRealtimeClient(port);
    client = connection.client;
    assert.equal(client.readyState === WebSocket.OPEN, true);
  } finally {
    await closeRealtimeHarness({ client, gateway, server });
  }
});

test("realtime connect limiter keys by trusted IP and rejects spoofed forwarded-prefix bypass", async () => {
  const beforeMetrics = getGatewayRuntimeMetricsSnapshot();
  const { createRealtimeGateway } = await loadRealtimeGatewayModule({
    realtimeConnectRateLimitIpPerMin: 1,
  });
  const consumeLimiter = createSharedFixedWindowLimiter();
  const connectLimiterKeys: string[] = [];

  const fetchStub = async (url: unknown, options?: unknown) => {
    const normalizedUrl = String(url || "");
    if (normalizedUrl.endsWith("/internal/gateway/rate-limit/consume")) {
      const body = parseJsonBody(options);
      const scope = String(body.scope || "");
      const key = String(body.key || "");
      const limitPerMinute = Number(body.limitPerMinute) || 1;
      if (scope === "realtime-connect-ip") {
        connectLimiterKeys.push(key);
      }
      return makeJsonResponse(
        200,
        consumeLimiter({
          scope,
          key,
          limitPerMinute,
          scopeLimits: {
            "realtime-connect-ip": 1,
          },
        }),
      );
    }
    if (normalizedUrl.endsWith("/internal/gateway/revoked-tokens")) {
      return makeJsonResponse(200, {
        events: [],
        nextCursor: "cursor-empty",
        cursorExpired: false,
      });
    }
    throw new Error(`Unexpected fetch URL in test: ${normalizedUrl}`);
  };

  const server = createServer((_req, res) => {
    res.statusCode = 404;
    res.end();
  });
  const gateway = createRealtimeGateway({
    server,
    trustProxyHops: 1,
    lookup: async () => [{ address: "93.184.216.34", family: 4 }],
    fetchFn: fetchStub,
    wsClientFactory: () => new FakeUpstreamWebSocket(),
  });

  let client;
  try {
    await new Promise((resolve) => {
      server.listen(0, "127.0.0.1", resolve);
    });
    const port = Number(server.address()?.port || 0);

    const opened = await connectRealtimeClient(port, {
      headers: {
        "x-forwarded-for": "198.51.100.1, 203.0.113.44",
      },
    });
    client = opened.client;
    await expectRealtimeHandshakeStatus(port, 429, {
      headers: {
        "x-forwarded-for": "198.51.100.2, 203.0.113.44",
      },
    });

    assert.equal(connectLimiterKeys.length >= 2, true);
    const trustedKey = hashLimiterKeyPart("203.0.113.44");
    assert.equal(connectLimiterKeys[0], trustedKey);
    assert.equal(connectLimiterKeys[1], trustedKey);
    assert.notEqual(trustedKey, hashLimiterKeyPart("198.51.100.1"));
  } finally {
    await closeRealtimeHarness({ client, gateway, server });
  }

  const afterMetrics = getGatewayRuntimeMetricsSnapshot();
  assert.equal(
    afterMetrics.realtimeLimiterAllowedCount - beforeMetrics.realtimeLimiterAllowedCount >= 1,
    true,
  );
  assert.equal(
    afterMetrics.realtimeLimiterRejectedCount - beforeMetrics.realtimeLimiterRejectedCount >= 1,
    true,
  );
});

test("public subscribe limiter uses trusted IP identity and blocks spoofed-prefix bypass", async () => {
  const beforeMetrics = getGatewayRuntimeMetricsSnapshot();
  const { createRealtimeGateway } = await loadRealtimeGatewayModule({
    realtimeConnectRateLimitIpPerMin: 20,
    realtimePublicSubscribeRateLimitIpPerMin: 1,
    realtimePublicSubscribeRateLimitShareTokenPerMin: 20,
  });
  const consumeLimiter = createSharedFixedWindowLimiter();
  const publicSubscribeIpKeys: string[] = [];

  const fetchStub = async (url: unknown, options?: unknown) => {
    const normalizedUrl = String(url || "");
    if (normalizedUrl.endsWith("/internal/gateway/rate-limit/consume")) {
      const body = parseJsonBody(options);
      const scope = String(body.scope || "");
      const key = String(body.key || "");
      const limitPerMinute = Number(body.limitPerMinute) || 1;
      if (scope === "realtime-public-subscribe-ip") {
        publicSubscribeIpKeys.push(key);
      }
      return makeJsonResponse(
        200,
        consumeLimiter({
          scope,
          key,
          limitPerMinute,
          scopeLimits: {
            "realtime-public-subscribe-ip": 1,
            "realtime-public-subscribe-share": 20,
          },
        }),
      );
    }
    if (normalizedUrl.endsWith("/internal/gateway/datasource-introspect")) {
      return makeJsonResponse(200, {
        scope: "datasource:stream",
        intent: {
          protocol: "websocket",
          url: "ws://example.com/stream",
          parser: "json",
          headers: {},
          protocols: [],
          idleTimeoutMs: 1000,
        },
      });
    }
    if (normalizedUrl.endsWith("/internal/gateway/revoked-tokens")) {
      return makeJsonResponse(200, {
        events: [],
        nextCursor: "cursor-empty",
        cursorExpired: false,
      });
    }
    throw new Error(`Unexpected fetch URL in test: ${normalizedUrl}`);
  };

  const server = createServer((_req, res) => {
    res.statusCode = 404;
    res.end();
  });
  const gateway = createRealtimeGateway({
    server,
    trustProxyHops: 1,
    lookup: async () => [{ address: "93.184.216.34", family: 4 }],
    fetchFn: fetchStub,
    wsClientFactory: () => new FakeUpstreamWebSocket(),
  });

  let firstClient;
  let secondClient;
  try {
    await new Promise((resolve) => {
      server.listen(0, "127.0.0.1", resolve);
    });
    const port = Number(server.address()?.port || 0);
    const publicSessionToken = createStreamToken({
      sub: "public",
      dashboardId: "dash-public-limit",
      datasourceId: "ds-public-limit",
      shareTokenVersion: 3,
    });

    const firstConnection = await connectRealtimeClient(port, {
      headers: {
        "x-forwarded-for": "198.51.100.10, 203.0.113.80",
      },
    });
    firstClient = firstConnection.client;
    firstClient.send(
      JSON.stringify({
        type: "subscribe",
        requestId: "sub-public-1",
        dashboardId: "dash-public-limit",
        datasourceId: "ds-public-limit",
        sessionToken: publicSessionToken,
      }),
    );

    const firstAck = await waitForMessage(
      firstConnection.messages,
      (message) => message.type === "ack" && message.requestId === "sub-public-1",
    );
    assert.equal(firstAck.ok, true);

    const secondConnection = await connectRealtimeClient(port, {
      headers: {
        "x-forwarded-for": "198.51.100.11, 203.0.113.80",
      },
    });
    secondClient = secondConnection.client;
    secondClient.send(
      JSON.stringify({
        type: "subscribe",
        requestId: "sub-public-2",
        dashboardId: "dash-public-limit",
        datasourceId: "ds-public-limit",
        sessionToken: publicSessionToken,
      }),
    );

    const secondAck = await waitForMessage(
      secondConnection.messages,
      (message) => message.type === "ack" && message.requestId === "sub-public-2",
    );
    assert.equal(secondAck.ok, false);
    assert.equal(secondAck.errorCode, "STREAM_RATE_LIMITED");
    assert.match(String(secondAck.message || ""), /too many public realtime subscribe requests/i);

    assert.equal(publicSubscribeIpKeys.length >= 2, true);
    const trustedKey = hashLimiterKeyPart("203.0.113.80");
    assert.equal(publicSubscribeIpKeys[0], trustedKey);
    assert.equal(publicSubscribeIpKeys[1], trustedKey);
    assert.notEqual(trustedKey, hashLimiterKeyPart("198.51.100.10"));
  } finally {
    await closeRealtimeHarness({ client: secondClient });
    await closeRealtimeHarness({ client: firstClient, gateway, server });
  }

  const afterMetrics = getGatewayRuntimeMetricsSnapshot();
  assert.equal(
    afterMetrics.realtimeLimiterAllowedCount - beforeMetrics.realtimeLimiterAllowedCount >= 2,
    true,
  );
  assert.equal(
    afterMetrics.realtimeLimiterRejectedCount - beforeMetrics.realtimeLimiterRejectedCount >= 1,
    true,
  );
});

test("shared limiter backend simulation enforces connect limits across gateway instances", async () => {
  const { createRealtimeGateway } = await loadRealtimeGatewayModule({
    realtimeConnectRateLimitIpPerMin: 1,
  });
  const consumeLimiter = createSharedFixedWindowLimiter();
  const connectLimiterKeys: string[] = [];

  const fetchStub = async (url: unknown, options?: unknown) => {
    const normalizedUrl = String(url || "");
    if (normalizedUrl.endsWith("/internal/gateway/rate-limit/consume")) {
      const body = parseJsonBody(options);
      const scope = String(body.scope || "");
      const key = String(body.key || "");
      const limitPerMinute = Number(body.limitPerMinute) || 1;
      if (scope === "realtime-connect-ip") {
        connectLimiterKeys.push(key);
      }
      return makeJsonResponse(
        200,
        consumeLimiter({
          scope,
          key,
          limitPerMinute,
          scopeLimits: {
            "realtime-connect-ip": 1,
          },
        }),
      );
    }
    if (normalizedUrl.endsWith("/internal/gateway/revoked-tokens")) {
      return makeJsonResponse(200, {
        events: [],
        nextCursor: "cursor-empty",
        cursorExpired: false,
      });
    }
    throw new Error(`Unexpected fetch URL in test: ${normalizedUrl}`);
  };

  const serverA = createServer((_req, res) => {
    res.statusCode = 404;
    res.end();
  });
  const serverB = createServer((_req, res) => {
    res.statusCode = 404;
    res.end();
  });
  const gatewayA = createRealtimeGateway({
    server: serverA,
    trustProxyHops: 1,
    lookup: async () => [{ address: "93.184.216.34", family: 4 }],
    fetchFn: fetchStub,
    wsClientFactory: () => new FakeUpstreamWebSocket(),
  });
  const gatewayB = createRealtimeGateway({
    server: serverB,
    trustProxyHops: 1,
    lookup: async () => [{ address: "93.184.216.34", family: 4 }],
    fetchFn: fetchStub,
    wsClientFactory: () => new FakeUpstreamWebSocket(),
  });

  let client;
  try {
    await new Promise((resolve) => {
      serverA.listen(0, "127.0.0.1", resolve);
    });
    await new Promise((resolve) => {
      serverB.listen(0, "127.0.0.1", resolve);
    });
    const portA = Number(serverA.address()?.port || 0);
    const portB = Number(serverB.address()?.port || 0);

    const opened = await connectRealtimeClient(portA, {
      headers: {
        "x-forwarded-for": "198.51.100.50, 203.0.113.120",
      },
    });
    client = opened.client;
    await expectRealtimeHandshakeStatus(portB, 429, {
      headers: {
        "x-forwarded-for": "198.51.100.51, 203.0.113.120",
      },
    });

    assert.equal(connectLimiterKeys.length >= 2, true);
    const trustedKey = hashLimiterKeyPart("203.0.113.120");
    assert.equal(connectLimiterKeys[0], trustedKey);
    assert.equal(connectLimiterKeys[1], trustedKey);
  } finally {
    await closeRealtimeHarness({ client, gateway: gatewayA, server: serverA });
    await closeRealtimeHarness({ gateway: gatewayB, server: serverB });
  }
});
