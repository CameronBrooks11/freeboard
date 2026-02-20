import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { createServer } from "node:http";
import { test } from "node:test";
import jwt from "jsonwebtoken";
import WebSocket from "ws";

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

const connectRealtimeClient = async (port) => {
  const client = new WebSocket(`ws://127.0.0.1:${port}/gateway/realtime`);
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

  const moduleUrl = new URL("../src/index.js", import.meta.url);
  moduleUrl.searchParams.set("testRun", `${Date.now()}-${Math.random()}`);
  return import(moduleUrl.href);
};

const expectRealtimeHandshakeStatus = async (port: number, expectedStatusCode: number) =>
  new Promise((resolve, reject) => {
    const client = new WebSocket(`ws://127.0.0.1:${port}/gateway/realtime`);
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
