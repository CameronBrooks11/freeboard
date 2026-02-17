/**
 * @module resolvers/DatasourceDiagnostics
 * @description Admin-only datasource diagnostics rollup resolver.
 */

import { ensureThatPrincipalHasServiceScope } from "../auth.js";
import Dashboard from "../models/Dashboard.js";
import BrokerProfile from "../models/BrokerProfile.js";

const ALLOWED_DATASOURCE_TYPES = new Set(["http", "clock", "static", "sse", "websocket", "mqtt"]);
const EXTERNAL_VISIBILITIES = new Set(["link", "public"]);

const normalizeType = (value) => {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();
  return normalized || "unknown";
};

export default {
  Query: {
    adminDatasourceDiagnostics: async (parent, args, context) => {
      ensureThatPrincipalHasServiceScope(context, ["datasource:diagnostics:read"]);

      const dashboards = await Dashboard.find({}).select("_id visibility datasources").lean();

      const brokerProfileIds = new Set();
      dashboards.forEach((dashboard) => {
        const datasources = Array.isArray(dashboard?.datasources) ? dashboard.datasources : [];
        datasources.forEach((datasource) => {
          const type = normalizeType(datasource?.type);
          if (type !== "mqtt") {
            return;
          }
          const brokerProfileId = String(datasource?.settings?.brokerProfileId || "").trim();
          if (brokerProfileId) {
            brokerProfileIds.add(brokerProfileId);
          }
        });
      });

      const brokerProfiles = await BrokerProfile.find({
        _id: { $in: [...brokerProfileIds] },
      })
        .select("_id credentialProfileId")
        .lean();
      const brokerCredentialMap = new Map(
        brokerProfiles.map((profile) => [
          String(profile._id),
          String(profile.credentialProfileId || "").trim(),
        ]),
      );

      let totalDatasources = 0;
      let credentialBoundDatasources = 0;
      let externalDashboardDatasources = 0;
      let invalidDatasources = 0;
      const typeCounts = new Map();

      dashboards.forEach((dashboard) => {
        const visibility = String(dashboard?.visibility || "private")
          .trim()
          .toLowerCase();
        const datasources = Array.isArray(dashboard?.datasources) ? dashboard.datasources : [];

        datasources.forEach((datasource) => {
          totalDatasources += 1;

          const type = normalizeType(datasource?.type);
          typeCounts.set(type, (typeCounts.get(type) || 0) + 1);
          if (!ALLOWED_DATASOURCE_TYPES.has(type)) {
            invalidDatasources += 1;
          }

          const credentialProfileId = String(
            datasource?.settings?.credentialProfileId || "",
          ).trim();
          if (["http", "sse", "websocket"].includes(type) && credentialProfileId) {
            credentialBoundDatasources += 1;
          }
          if (type === "mqtt") {
            const brokerProfileId = String(datasource?.settings?.brokerProfileId || "").trim();
            if (brokerProfileId && brokerCredentialMap.get(brokerProfileId)) {
              credentialBoundDatasources += 1;
            }
          }

          if (EXTERNAL_VISIBILITIES.has(visibility)) {
            externalDashboardDatasources += 1;
          }
        });
      });

      return {
        totalDashboards: dashboards.length,
        totalDatasources,
        credentialBoundDatasources,
        externalDashboardDatasources,
        invalidDatasources,
        typeCounts: [...typeCounts.entries()]
          .map(([type, count]) => ({ type, count }))
          .sort((a, b) => {
            if (b.count !== a.count) {
              return b.count - a.count;
            }
            return a.type.localeCompare(b.type);
          }),
      };
    },
  },
};
