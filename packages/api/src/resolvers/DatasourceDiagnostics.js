/**
 * @module resolvers/DatasourceDiagnostics
 * @description Admin-only datasource diagnostics rollup resolver.
 */

import { ensureThatUserIsAdministrator } from "../auth.js";
import Dashboard from "../models/Dashboard.js";

const ALLOWED_DATASOURCE_TYPES = new Set(["http", "clock", "static"]);
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
      ensureThatUserIsAdministrator(context);

      const dashboards = await Dashboard.find({})
        .select("_id visibility datasources")
        .lean();

      let totalDatasources = 0;
      let credentialBoundDatasources = 0;
      let externalDashboardDatasources = 0;
      let invalidDatasources = 0;
      const typeCounts = new Map();

      dashboards.forEach((dashboard) => {
        const visibility = String(dashboard?.visibility || "private")
          .trim()
          .toLowerCase();
        const datasources = Array.isArray(dashboard?.datasources)
          ? dashboard.datasources
          : [];

        datasources.forEach((datasource) => {
          totalDatasources += 1;

          const type = normalizeType(datasource?.type);
          typeCounts.set(type, (typeCounts.get(type) || 0) + 1);
          if (!ALLOWED_DATASOURCE_TYPES.has(type)) {
            invalidDatasources += 1;
          }

          const credentialProfileId = String(
            datasource?.settings?.credentialProfileId || ""
          ).trim();
          if (type === "http" && credentialProfileId) {
            credentialBoundDatasources += 1;
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
