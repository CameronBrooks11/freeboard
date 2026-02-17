import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import {
  disposeAllStreamingManagers,
  getStreamingManager,
} from "../src/datasources/runtime/StreamingManager.js";

const originalWindow = globalThis.window;
const originalWebSocket = globalThis.WebSocket;

class MockWebSocket {
  static OPEN = 1;

  static CLOSED = 3;

  static instances = [];

  readyState = 0;

  listeners = new Map();

  sent = [];

  constructor(url) {
    this.url = url;
    MockWebSocket.instances.push(this);
    setTimeout(() => {
      this.readyState = MockWebSocket.OPEN;
      this.emit("open", {});
    }, 0);
  }

  addEventListener(type, handler) {
    const handlers = this.listeners.get(type) || [];
    handlers.push(handler);
    this.listeners.set(type, handlers);
  }

  removeEventListener(type, handler) {
    const handlers = this.listeners.get(type) || [];
    this.listeners.set(
      type,
      handlers.filter((entry) => entry !== handler),
    );
  }

  send(serializedPayload) {
    this.sent.push(serializedPayload);
    const payload = JSON.parse(serializedPayload);

    if (payload.type === "subscribe" || payload.type === "unsubscribe") {
      setTimeout(() => {
        this.emit("message", {
          data: JSON.stringify({
            type: "ack",
            requestId: payload.requestId,
            datasourceId: payload.datasourceId,
            ok: true,
          }),
        });
      }, 0);
    }

    if (payload.type === "ping") {
      setTimeout(() => {
        this.emit("message", {
          data: JSON.stringify({
            type: "pong",
            requestId: payload.requestId,
          }),
        });
      }, 0);
    }
  }

  close() {
    if (this.readyState === MockWebSocket.CLOSED) {
      return;
    }
    this.readyState = MockWebSocket.CLOSED;
    this.emit("close", {});
  }

  emit(type, event) {
    const handlers = this.listeners.get(type) || [];
    handlers.forEach((handler) => handler(event));
  }
}

const encodeBase64Url = (value) =>
  Buffer.from(value, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");

const createToken = (expiresInSeconds) => {
  const payload = {
    exp: Math.floor(Date.now() / 1000) + expiresInSeconds,
  };
  return `${encodeBase64Url(JSON.stringify({ alg: "none", typ: "JWT" }))}.${encodeBase64Url(
    JSON.stringify(payload),
  )}.signature`;
};

afterEach(() => {
  disposeAllStreamingManagers();
  MockWebSocket.instances = [];

  if (originalWindow === undefined) {
    delete globalThis.window;
  } else {
    globalThis.window = originalWindow;
  }

  if (originalWebSocket === undefined) {
    delete globalThis.WebSocket;
  } else {
    globalThis.WebSocket = originalWebSocket;
  }
});

test("StreamingManager subscribes, routes data payloads, and unsubscribes", async () => {
  globalThis.window = {
    location: {
      protocol: "http:",
      host: "localhost:5173",
    },
  };
  globalThis.WebSocket = MockWebSocket;

  const manager = getStreamingManager("dash-test");
  const received = [];

  await manager.subscribe({
    dashboardId: "dash-test",
    datasourceId: "ds-stream-1",
    sessionToken: createToken(3600),
    callbacks: {
      onData: (message) => {
        received.push(message.payload);
      },
    },
  });

  const socket = MockWebSocket.instances[0];
  assert.ok(socket);

  socket.emit("message", {
    data: JSON.stringify({
      type: "data",
      datasourceId: "ds-stream-1",
      payload: { value: 42 },
      timestamp: new Date().toISOString(),
    }),
  });

  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(received, [{ value: 42 }]);

  await manager.unsubscribe("ds-stream-1");
  const sentTypes = socket.sent.map((entry) => JSON.parse(entry).type);
  assert.ok(sentTypes.includes("subscribe"));
  assert.ok(sentTypes.includes("unsubscribe"));
});

test("StreamingManager refreshToken resends subscribe with new token", async () => {
  globalThis.window = {
    location: {
      protocol: "http:",
      host: "localhost:5173",
    },
  };
  globalThis.WebSocket = MockWebSocket;

  const manager = getStreamingManager("dash-test");
  await manager.subscribe({
    dashboardId: "dash-test",
    datasourceId: "ds-stream-2",
    sessionToken: createToken(3600),
    callbacks: {},
  });

  const socket = MockWebSocket.instances[0];
  const initialSubscribeCount = socket.sent.filter(
    (entry) => JSON.parse(entry).type === "subscribe",
  ).length;

  await manager.refreshToken("ds-stream-2", createToken(7200));

  const finalSubscribeCount = socket.sent.filter(
    (entry) => JSON.parse(entry).type === "subscribe",
  ).length;
  assert.equal(finalSubscribeCount, initialSubscribeCount + 1);
});
