import assert from "node:assert/strict";
import test from "node:test";

import { config } from "../src/config.js";
import {
  buildCanonicalDatasourceIntent,
  hashDatasourceIntent,
  resolveGatewayIntrospection,
} from "../src/datasourceGateway.js";

const buildDashboard = (overrides = {}) => ({
  _id: "dash-introspection-1",
  user: "owner-1",
  visibility: "public",
  shareToken: "share-token-1",
  shareTokenVersion: 3,
  acl: [],
  datasources: [
    {
      id: "ds-http-1",
      type: "http",
      settings: {
        url: "https://example.com/api/health",
        method: "GET",
        parser: "json",
        timeoutMs: 5000,
        headers: {
          Accept: "application/json",
        },
      },
    },
  ],
  ...overrides,
});

test("buildCanonicalDatasourceIntent normalizes parser/method/timeout and header JSON", async () => {
  const dashboard = buildDashboard({
    datasources: [
      {
        id: "ds-http-1",
        type: "http",
        settings: {
          url: "https://example.com/api/health",
          method: "invalid",
          parser: "invalid",
          timeoutMs: "oops",
          headers: "{\"X-Test\":\"phase5\"}",
          body: { ping: true },
        },
      },
    ],
  });

  const intent = await buildCanonicalDatasourceIntent({
    dashboard,
    datasourceId: "ds-http-1",
  });

  assert.equal(intent.method, "GET");
  assert.equal(intent.parser, "json");
  assert.equal(intent.timeoutMs, config.fetchTimeoutMs);
  assert.deepEqual(intent.headers, { "X-Test": "phase5" });
  assert.equal(intent.body, "{\"ping\":true}");
});

test("resolveGatewayIntrospection rejects stale public share token version", async () => {
  const dashboard = buildDashboard({ shareTokenVersion: 7 });
  const canonicalIntent = await buildCanonicalDatasourceIntent({
    dashboard,
    datasourceId: "ds-http-1",
  });

  const tokenClaims = {
    sub: "public",
    intentHash: hashDatasourceIntent(canonicalIntent),
    shareTokenVersion: 6,
  };

  await assert.rejects(
    () =>
      resolveGatewayIntrospection({
        dashboard,
        datasourceId: "ds-http-1",
        tokenClaims,
        decryptSecret: () => ({}),
      }),
    /Share token is stale/
  );
});

test("resolveGatewayIntrospection returns canonical gateway intent for valid public token", async () => {
  const dashboard = buildDashboard({
    shareTokenVersion: 11,
    datasources: [
      {
        id: "ds-http-1",
        type: "http",
        settings: {
          url: "https://example.com/api/metrics?scope=core",
          method: "post",
          parser: "csv",
          timeoutMs: 2500,
          headers: {
            "X-Client": "freeboard",
          },
          body: "{\"from\":\"phase5\"}",
        },
      },
    ],
  });

  const canonicalIntent = await buildCanonicalDatasourceIntent({
    dashboard,
    datasourceId: "ds-http-1",
  });

  const tokenClaims = {
    sub: "public",
    intentHash: hashDatasourceIntent(canonicalIntent),
    shareTokenVersion: 11,
  };

  const resolved = await resolveGatewayIntrospection({
    dashboard,
    datasourceId: "ds-http-1",
    tokenClaims,
    decryptSecret: () => ({}),
  });

  assert.equal(resolved.dashboardId, "dash-introspection-1");
  assert.equal(resolved.datasourceId, "ds-http-1");
  assert.equal(resolved.credentialProfileId, null);
  assert.equal(resolved.intent.url, "https://example.com/api/metrics?scope=core");
  assert.equal(resolved.intent.method, "POST");
  assert.equal(resolved.intent.parser, "csv");
  assert.equal(resolved.intent.timeoutMs, 2500);
  assert.equal(resolved.intent.headers["X-Client"], "freeboard");
  assert.equal(resolved.intent.body, "{\"from\":\"phase5\"}");
});
