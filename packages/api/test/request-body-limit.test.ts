import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { createSchema, createYoga } from "graphql-yoga";
import { useGraphQLSSE } from "@graphql-yoga/plugin-graphql-sse";
import { createClient } from "graphql-sse";

import {
  MAX_REQUEST_BODY_BYTES,
  RequestBodyTooLargeError,
  enforceRequestBodyLimit,
  readCappedRawBody,
} from "../src/security/requestBodyLimit.js";

// #208: a chunked request without `content-length` slips past the header check, so
// the cap must be enforced on the bytes actually streamed — without corrupting
// Yoga's body read (POST) or the SSE subscription path (GET).

const streamOf = async function* (chunks: Array<string | Buffer>) {
  for (const chunk of chunks) {
    yield chunk;
  }
};

test("readCappedRawBody concatenates chunks under the cap", async () => {
  const body = await readCappedRawBody(streamOf(["ab", "cd"]), 100);
  assert.equal(body.toString(), "abcd");
});

test("readCappedRawBody rejects with 413 once the cap is exceeded", async () => {
  await assert.rejects(
    () => readCappedRawBody(streamOf(["a".repeat(60), "b".repeat(60)]), 100),
    (error) => error instanceof RequestBodyTooLargeError && error.statusCode === 413,
  );
});

test("readCappedRawBody returns an empty buffer for an empty stream", async () => {
  assert.equal((await readCappedRawBody(streamOf([]), 100)).length, 0);
});

test("MAX_REQUEST_BODY_BYTES is 5 MiB", () => {
  assert.equal(MAX_REQUEST_BODY_BYTES, 5 * 1024 * 1024);
});

// --- Integration: the limiter in front of a real Yoga server ---

const schema = createSchema({
  typeDefs: /* GraphQL */ `
    type Query {
      ping: String
    }
    type Subscription {
      ticks: Int
    }
  `,
  resolvers: {
    Query: { ping: () => "pong" },
    Subscription: {
      ticks: {
        subscribe: async function* () {
          yield { ticks: 1 };
        },
      },
    },
  },
});

const startServer = async (maxBytes: number) => {
  const yoga = createYoga({ schema, plugins: [useGraphQLSSE()] });
  const server = createServer((req, res) => {
    void enforceRequestBodyLimit(req, res, maxBytes).then((mayProceed) => {
      if (mayProceed) {
        yoga(req, res);
      }
    });
  });
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://localhost:${port}/graphql`,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
};

test("POST: a normal query reaches Yoga via the buffered body", async () => {
  const server = await startServer(MAX_REQUEST_BODY_BYTES);
  try {
    const response = await fetch(server.url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query: "{ ping }" }),
    });
    const json = (await response.json()) as { data?: { ping?: string } };
    assert.equal(json.data?.ping, "pong");
  } finally {
    await server.close();
  }
});

test("POST: a large under-cap JSON body is parsed (no O(n) byte-index stall)", async () => {
  const server = await startServer(MAX_REQUEST_BODY_BYTES);
  try {
    // ~1 MiB of ignored `extensions` padding — exercises the parsed-object path
    // for a large body, which must not enumerate per-byte keys.
    const body = JSON.stringify({
      query: "{ ping }",
      extensions: { pad: "a".repeat(1024 * 1024) },
    });
    const started = Date.now();
    const response = await fetch(server.url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    });
    const json = (await response.json()) as { data?: { ping?: string } };
    assert.equal(json.data?.ping, "pong");
    assert.ok(Date.now() - started < 2000, "a 1 MiB body must not stall the event loop");
  } finally {
    await server.close();
  }
});

test("POST: an oversized CHUNKED body (no content-length) is rejected with 413", async () => {
  const server = await startServer(1024);
  try {
    // A ReadableStream body makes fetch use chunked transfer-encoding (no
    // content-length) — the exact bypass the header check can't catch.
    const oversized = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("x".repeat(4096)));
        controller.close();
      },
    });
    const response = await fetch(server.url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: oversized,
      // @ts-expect-error - duplex is required by Node fetch for a stream body
      duplex: "half",
    });
    assert.equal(response.status, 413);
  } finally {
    await server.close();
  }
});

test("POST: an empty body does not hang and yields a GraphQL error, not a crash", async () => {
  const server = await startServer(1024);
  try {
    const response = await fetch(server.url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "",
    });
    // Yoga rejects an empty operation with a 400-class GraphQL error; the point is
    // the request completes (no hang) after the body was consumed by the limiter.
    const json = (await response.json()) as { data?: unknown; errors?: unknown[] };
    assert.ok(Array.isArray(json.errors) && json.errors.length > 0);
    assert.equal(json.data ?? null, null);
  } finally {
    await server.close();
  }
});

test("GET: a query passes through untouched (no body handling)", async () => {
  const server = await startServer(1024);
  try {
    const response = await fetch(`${server.url}?query=${encodeURIComponent("{ ping }")}`);
    const json = (await response.json()) as { data?: { ping?: string } };
    assert.equal(json.data?.ping, "pong");
  } finally {
    await server.close();
  }
});

test("POST/SSE: a subscription request body is buffered and the stream still flows", async () => {
  const server = await startServer(1024);
  const controller = new AbortController();
  try {
    const response = await fetch(server.url, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "text/event-stream" },
      body: JSON.stringify({ query: "subscription { ticks }" }),
      signal: controller.signal,
    });
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type") ?? "", /text\/event-stream/);

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
      if (text.includes("ticks")) {
        break;
      }
    }
    assert.match(text, /ticks/, "expected the POST subscription event to stream through");
  } finally {
    controller.abort();
    await server.close();
  }
});

test("graphql-sse client (the UI's production subscription transport) works through the limiter", async () => {
  // The UI's SSELink uses graphql-sse's default single-connection mode: a PUT to
  // reserve the stream, a GET for the event stream, and POST(s) for operations —
  // all of which pass through the body limiter. This exercises that full handshake.
  const server = await startServer(1024);
  const client = createClient({ url: server.url, fetchFn: fetch, retryAttempts: 0 });
  try {
    const value = await new Promise<{ data?: { ticks?: number } }>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("timed out waiting for SSE event")), 4000);
      client.subscribe(
        { query: "subscription { ticks }" },
        {
          next: (result) => {
            clearTimeout(timer);
            resolve(result as { data?: { ticks?: number } });
          },
          error: (error) => {
            clearTimeout(timer);
            reject(error instanceof Error ? error : new Error(String(error)));
          },
          complete: () => {},
        },
      );
    });
    assert.equal(value.data?.ticks, 1);
  } finally {
    await client.dispose();
    await server.close();
  }
});

test("GET/SSE: a subscription stream is established and delivers an event", async () => {
  const server = await startServer(1024);
  const controller = new AbortController();
  try {
    const response = await fetch(
      `${server.url}?query=${encodeURIComponent("subscription { ticks }")}`,
      { headers: { accept: "text/event-stream" }, signal: controller.signal },
    );
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type") ?? "", /text\/event-stream/);

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
      if (text.includes("ticks")) {
        break;
      }
    }
    assert.match(text, /ticks/, "expected the subscription event to stream through");
  } finally {
    controller.abort();
    await server.close();
  }
});
