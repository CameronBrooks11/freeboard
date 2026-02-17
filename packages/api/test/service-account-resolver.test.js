import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import ServiceAccountResolvers from "../src/resolvers/ServiceAccount.js";

const originalFetch = global.fetch;

afterEach(() => {
  global.fetch = originalFetch;
});

test("adminRuntimeMetrics rejects principal without ops:read scope", async () => {
  await assert.rejects(
    () =>
      ServiceAccountResolvers.Query.adminRuntimeMetrics(
        null,
        {},
        {
          serviceAccount: {
            _id: "svc-1",
            scopes: ["datasource:mint"],
          },
        },
      ),
    /scope/i,
  );
});

test("adminRuntimeMetrics returns api and gateway metrics for scoped service account", async () => {
  global.fetch = async () => ({
    ok: true,
    json: async () => ({
      httpRequestCount: 5,
      realtimeConnectionAttempts: 2,
    }),
  });

  const result = await ServiceAccountResolvers.Query.adminRuntimeMetrics(
    null,
    {},
    {
      serviceAccount: {
        _id: "svc-1",
        scopes: ["ops:read"],
      },
    },
  );

  assert.equal(typeof result.collectedAt, "string");
  assert.equal(typeof result.api.requestCount, "number");
  assert.equal(result.gateway.httpRequestCount, 5);
  assert.equal(result.gateway.realtimeConnectionAttempts, 2);
});
