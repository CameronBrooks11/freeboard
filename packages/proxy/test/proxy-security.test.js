import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { test } from "node:test";

import {
  createProxyHandler,
  ensureResolvedDestinationIsAllowed,
  parseTargetUrl,
} from "../src/index.js";

test("parseTargetUrl rejects missing url parameter", () => {
  assert.throws(
    () =>
      parseTargetUrl({
        url: "/proxy",
        headers: {
          host: "localhost:8001",
        },
      }),
    /Missing required query parameter: url/
  );
});

test("ensureResolvedDestinationIsAllowed blocks private resolved destinations", async () => {
  await assert.rejects(
    () =>
      ensureResolvedDestinationIsAllowed("example.com", {
        lookup: async () => [{ address: "127.0.0.1", family: 4 }],
      }),
    /Target resolves to a blocked address/
  );
});

test("ensureResolvedDestinationIsAllowed returns pinned destination address", async () => {
  const result = await ensureResolvedDestinationIsAllowed("example.com", {
    lookup: async () => [{ address: "93.184.216.34", family: 4 }],
  });

  assert.deepEqual(result, {
    address: "93.184.216.34",
    family: 4,
  });
});

test("proxy handler connects by resolved IP while preserving Host header", async () => {
  let capturedOptions = null;

  const requestStub = (options, callback) => {
    capturedOptions = options;
    const request = new EventEmitter();
    request.write = () => {};
    request.destroy = (error) => {
      if (error) {
        request.emit("error", error);
      }
    };
    request.end = () => {
      const upstreamRes = new EventEmitter();
      upstreamRes.headers = { "content-type": "application/json" };
      upstreamRes.statusCode = 200;
      callback(upstreamRes);
      upstreamRes.emit("end");
    };
    return request;
  };

  const handler = createProxyHandler({
    lookup: async () => [{ address: "93.184.216.34", family: 4 }],
    httpRequest: requestStub,
  });

  const clientReq = {
    url: "/proxy?url=http%3A%2F%2Fexample.com%2Fapi%2Fstatus",
    headers: {
      host: "localhost:8001",
      accept: "application/json",
    },
    method: "GET",
    body: "",
  };

  const clientRes = {
    headersSent: false,
    writableEnded: false,
    statusCode: null,
    responseHeaders: null,
    chunks: [],
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.headersSent = true;
      this.payload = payload;
      this.writableEnded = true;
      return this;
    },
    writeHead(code, headers) {
      this.statusCode = code;
      this.responseHeaders = headers;
      this.headersSent = true;
    },
    write(chunk) {
      this.chunks.push(chunk);
    },
    end() {
      this.writableEnded = true;
    },
  };

  await handler(clientReq, clientRes);

  assert.ok(capturedOptions);
  assert.equal(capturedOptions.hostname, "93.184.216.34");
  assert.equal(capturedOptions.family, 4);
  assert.equal(capturedOptions.headers.host, "example.com");
});
