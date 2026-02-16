import assert from "node:assert/strict";
import test from "node:test";

import {
  hashDatasourceIntent,
  mintDatasourceSessionToken,
  validateDatasourceSessionToken,
} from "../src/datasourceGateway.js";

const buildDashboard = (overrides = {}) => ({
  _id: "dash-1",
  visibility: "private",
  shareToken: "share-token-1",
  shareTokenVersion: 2,
  user: "owner-1",
  acl: [],
  datasources: [
    {
      id: "ds-1",
      type: "http",
      settings: {
        url: "https://example.com/api/status",
        method: "GET",
        parser: "json",
        timeoutMs: 10000,
        headers: { Accept: "application/json" },
      },
    },
  ],
  ...overrides,
});

test("hashDatasourceIntent is deterministic for canonical intent", () => {
  const baseIntent = {
    dashboardId: "dash-1",
    datasourceId: "ds-1",
    url: "https://example.com/api/status",
    method: "GET",
    body: null,
    parser: "json",
    timeoutMs: 10000,
    headers: { Accept: "application/json" },
    credentialProfile: null,
  };

  const first = hashDatasourceIntent(baseIntent);
  const second = hashDatasourceIntent({ ...baseIntent });

  assert.equal(first, second);
});

test("mintDatasourceSessionToken rejects link/public token mint without share token", () => {
  const dashboard = buildDashboard({ visibility: "link" });

  assert.throws(
    () =>
      mintDatasourceSessionToken({
        dashboard,
        datasourceId: "ds-1",
        user: null,
      }),
    /share token/i
  );
});

test("mintDatasourceSessionToken for public flow embeds shareTokenVersion", () => {
  const dashboard = buildDashboard({ visibility: "public", shareTokenVersion: 7 });

  const minted = mintDatasourceSessionToken({
    dashboard,
    datasourceId: "ds-1",
    user: null,
  });

  assert.ok(minted.token);
  const claims = validateDatasourceSessionToken(minted.token);
  assert.equal(claims.sub, "public");
  assert.equal(claims.shareTokenVersion, 7);
  assert.equal(claims.dashboardId, "dash-1");
  assert.equal(claims.datasourceId, "ds-1");
});
