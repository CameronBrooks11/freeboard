import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { test } from "node:test";
import jwt from "jsonwebtoken";

import {
  createGatewayFetchHandler,
  ensureResolvedDestinationIsAllowed,
  parseTargetUrl,
} from "../src/index.js";

test("parseTargetUrl rejects missing target URL", () => {
  assert.throws(() => parseTargetUrl(""), /Target URL is required/);
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

test("gateway fetch handler connects by resolved IP while preserving Host header", async () => {
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
      upstreamRes.emit("data", Buffer.from('{"ok":true}'));
      upstreamRes.emit("end");
    };
    return request;
  };

  const fetchStub = async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      intent: {
        url: "http://example.com/api/status",
        method: "GET",
        parser: "json",
        timeoutMs: 10000,
        headers: {},
        body: null,
      },
    }),
  });

  const handler = createGatewayFetchHandler({
    lookup: async () => [{ address: "93.184.216.34", family: 4 }],
    httpRequest: requestStub,
    fetchFn: fetchStub,
  });

  const sessionToken = jwt.sign(
    {
      iss: "freeboard-api",
      aud: "freeboard-gateway",
      sub: "user-1",
      scope: "datasource:fetch",
      dashboardId: "dash-1",
      datasourceId: "ds-1",
    },
    "freeboard-gateway-dev-insecure-local-only-secret-32",
    { algorithm: "HS256", expiresIn: "5m" }
  );

  const clientReq = {
    headers: {
      authorization: `Bearer ${sessionToken}`,
    },
    method: "POST",
    body: {
      dashboardId: "dash-1",
      datasourceId: "ds-1",
    },
  };

  const clientRes = {
    headersSent: false,
    writableEnded: false,
    statusCode: null,
    payload: null,
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
  };

  await handler(clientReq, clientRes);

  assert.ok(capturedOptions);
  assert.equal(capturedOptions.hostname, "93.184.216.34");
  assert.equal(capturedOptions.family, 4);
  assert.equal(capturedOptions.headers.host, "example.com");
  assert.equal(clientRes.statusCode, 200);
  assert.deepEqual(clientRes.payload?.data, { ok: true });
});

test("gateway fetch handler rejects upstream non-2xx responses", async () => {
  const requestStub = (_options, callback) => {
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
      upstreamRes.statusCode = 500;
      callback(upstreamRes);
      upstreamRes.emit("data", Buffer.from('{"error":"bad"}'));
      upstreamRes.emit("end");
    };
    return request;
  };

  const fetchStub = async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      intent: {
        url: "http://example.com/api/status",
        method: "GET",
        parser: "json",
        timeoutMs: 10000,
        headers: {},
        body: null,
      },
    }),
  });

  const handler = createGatewayFetchHandler({
    lookup: async () => [{ address: "93.184.216.34", family: 4 }],
    httpRequest: requestStub,
    fetchFn: fetchStub,
  });

  const sessionToken = jwt.sign(
    {
      iss: "freeboard-api",
      aud: "freeboard-gateway",
      sub: "user-1",
      scope: "datasource:fetch",
      dashboardId: "dash-1",
      datasourceId: "ds-1",
    },
    "freeboard-gateway-dev-insecure-local-only-secret-32",
    { algorithm: "HS256", expiresIn: "5m" }
  );

  const clientReq = {
    headers: {
      authorization: `Bearer ${sessionToken}`,
    },
    method: "POST",
    body: {
      dashboardId: "dash-1",
      datasourceId: "ds-1",
    },
  };

  const clientRes = {
    headersSent: false,
    writableEnded: false,
    statusCode: null,
    payload: null,
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
  };

  await handler(clientReq, clientRes);

  assert.equal(clientRes.statusCode, 502);
  assert.match(String(clientRes.payload?.error || ""), /Gateway request failed/);
});
