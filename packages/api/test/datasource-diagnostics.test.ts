import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import DatasourceDiagnosticsResolvers from "../src/resolvers/DatasourceDiagnostics.js";
import { dataStore } from "../src/data/index.js";

const dashboardRepository = dataStore.repositories.dashboards;
const brokerProfileRepository = dataStore.repositories.brokerProfiles;
const originalDashboardListForDiagnostics = dashboardRepository.listForDiagnostics;
const originalBrokerProfileFindByIds = brokerProfileRepository.findByIds;

afterEach(() => {
  dashboardRepository.listForDiagnostics = originalDashboardListForDiagnostics;
  brokerProfileRepository.findByIds = originalBrokerProfileFindByIds;
});

test("adminDatasourceDiagnostics requires admin principal or datasource diagnostics scope", async () => {
  await assert.rejects(
    () =>
      DatasourceDiagnosticsResolvers.Query.adminDatasourceDiagnostics(
        null,
        {},
        { user: { _id: "viewer-1", role: "viewer" } },
      ),
    /authenticated|scope/i,
  );
});

test("adminDatasourceDiagnostics allows service account with datasource diagnostics scope", async () => {
  dashboardRepository.listForDiagnostics = async () => [];
  brokerProfileRepository.findByIds = async () => [];

  const result = await DatasourceDiagnosticsResolvers.Query.adminDatasourceDiagnostics(
    null,
    {},
    {
      serviceAccount: {
        _id: "svc-1",
        scopes: ["datasource:diagnostics:read"],
      },
    },
  );

  assert.equal(result.totalDashboards, 0);
  assert.equal(result.totalDatasources, 0);
});

test("adminDatasourceDiagnostics returns datasource rollup counts", async () => {
  dashboardRepository.listForDiagnostics = async () => [
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
  ];
  brokerProfileRepository.findByIds = async ({ profileIds }) =>
    profileIds.map((profileId) => ({
      _id: profileId,
      credentialProfileId: profileId === "broker-1" ? "cred-3" : null,
      name: "",
      description: "",
      protocol: "mqtt",
      brokerUrl: "",
      tls: {},
      allowPublicUse: false,
      topicAllowlist: [],
      createdBy: null,
      updatedBy: null,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    }));

  const result = await DatasourceDiagnosticsResolvers.Query.adminDatasourceDiagnostics(
    null,
    {},
    { user: { _id: "admin-1", role: "admin" } },
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
