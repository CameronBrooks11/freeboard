import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import DatasourceResolvers from "../src/resolvers/Datasource.js";
import { dataStore } from "../src/data/index.js";

const dashboardRepository = dataStore.repositories.dashboards;
const originalDashboardFindById = dashboardRepository.findById;

const buildDashboard = () => ({
  _id: "dash-1",
  user: "user-1",
  visibility: "private",
  acl: [],
  document: {
    schemaVersion: 1,
    title: "Main",
    image: null,
    columns: 3,
    width: "md",
    settings: { theme: "auto" },
    panes: [],
    datasources: [
      {
        id: "ds-1",
        type: "http",
        settings: {
          url: "https://example.com/api",
          method: "GET",
          parser: "json",
        },
      },
    ],
  },
});

afterEach(() => {
  dashboardRepository.findById = originalDashboardFindById;
});

test("mintDatasourceSessionToken allows normal authenticated user context", async () => {
  dashboardRepository.findById = async ({ dashboardId }) =>
    dashboardId === "dash-1" ? buildDashboard() : null;

  const result = await DatasourceResolvers.Mutation.mintDatasourceSessionToken(
    null,
    { dashboardId: "dash-1", datasourceId: "ds-1", shareToken: null },
    {
      user: { _id: "user-1", role: "viewer", active: true },
      clientIp: "127.0.0.1",
    },
  );

  assert.ok(result?.token);
  assert.equal(typeof result?.expiresAt, "string");
  assert.equal(Number.isNaN(new Date(result.expiresAt).getTime()), false);
});

test("mintDatasourceSessionToken rejects service account without datasource:mint scope", async () => {
  await assert.rejects(
    () =>
      DatasourceResolvers.Mutation.mintDatasourceSessionToken(
        null,
        { dashboardId: "dash-1", datasourceId: "ds-1", shareToken: null },
        {
          serviceAccount: {
            _id: "svc-1",
            scopes: ["ops:read"],
          },
          clientIp: "127.0.0.1",
        },
      ),
    /scope does not allow/i,
  );
});
