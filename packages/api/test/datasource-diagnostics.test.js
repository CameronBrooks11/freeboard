import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import Dashboard from "../src/models/Dashboard.js";
import BrokerProfile from "../src/models/BrokerProfile.js";
import DatasourceDiagnosticsResolvers from "../src/resolvers/DatasourceDiagnostics.js";

const originalDashboardFind = Dashboard.find;
const originalBrokerProfileFind = BrokerProfile.find;

afterEach(() => {
  Dashboard.find = originalDashboardFind;
  BrokerProfile.find = originalBrokerProfileFind;
});

test("adminDatasourceDiagnostics requires admin role", async () => {
  await assert.rejects(
    () =>
      DatasourceDiagnosticsResolvers.Query.adminDatasourceDiagnostics(
        null,
        {},
        { user: { _id: "viewer-1", role: "viewer" } }
      ),
    /administrator/i
  );
});

test("adminDatasourceDiagnostics returns datasource rollup counts", async () => {
  Dashboard.find = () => ({
    select: () => ({
      lean: async () => [
        {
          _id: "dash-1",
          visibility: "private",
          datasources: [
            {
              id: "ds-1",
              type: "http",
              settings: { url: "https://example.com", credentialProfileId: "cred-1" },
            },
            {
              id: "ds-2",
              type: "clock",
              settings: {},
            },
            {
              id: "ds-5",
              type: "sse",
              settings: {
                url: "https://events.example.com/stream",
                credentialProfileId: "cred-2",
              },
            },
          ],
        },
        {
          _id: "dash-2",
          visibility: "public",
          datasources: [
            {
              id: "ds-3",
              type: "http",
              settings: { url: "https://example.com/public" },
            },
            {
              id: "ds-4",
              type: "legacy",
              settings: {},
            },
            {
              id: "ds-6",
              type: "mqtt",
              settings: {
                brokerProfileId: "broker-1",
                topic: "factory/line1/status",
              },
            },
          ],
        },
      ],
    }),
  });
  BrokerProfile.find = ({ _id }) => ({
    select: () => ({
      lean: async () =>
        (_id?.$in || []).map((profileId) => ({
          _id: profileId,
          credentialProfileId: profileId === "broker-1" ? "cred-3" : null,
        })),
    }),
  });

  const result = await DatasourceDiagnosticsResolvers.Query.adminDatasourceDiagnostics(
    null,
    {},
    { user: { _id: "admin-1", role: "admin" } }
  );

  assert.equal(result.totalDashboards, 2);
  assert.equal(result.totalDatasources, 6);
  assert.equal(result.credentialBoundDatasources, 3);
  assert.equal(result.externalDashboardDatasources, 3);
  assert.equal(result.invalidDatasources, 1);
  assert.deepEqual(result.typeCounts, [
    { type: "http", count: 2 },
    { type: "clock", count: 1 },
    { type: "legacy", count: 1 },
    { type: "mqtt", count: 1 },
    { type: "sse", count: 1 },
  ]);
});
