/**
 * @module resolvers/DatasourceDiagnostics
 * Admin-only datasource diagnostics rollup resolver.
 */

import { ensureThatPrincipalHasServiceScope } from "../auth.js";
import type { IResolvers } from "@graphql-tools/utils";
import { dataStore } from "../data/index.js";

const ALLOWED_DATASOURCE_TYPES = new Set(["http", "clock", "static", "sse", "websocket", "mqtt"]);
const EXTERNAL_VISIBILITIES = new Set(["link", "public"]);
type DatasourceLike = {
  type?: unknown;
  settings?: {
    brokerProfileId?: unknown;
    credentialProfileId?: unknown;
  };
};

const toDatasourceArray = (value: unknown): DatasourceLike[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      return {};
    }
    const record = entry as Record<string, unknown>;
    const settings =
      record.settings && typeof record.settings === "object" && !Array.isArray(record.settings)
        ? (record.settings as Record<string, unknown>)
        : undefined;
    return settings
      ? {
          type: record.type,
          settings: {
            brokerProfileId: settings.brokerProfileId,
            credentialProfileId: settings.credentialProfileId,
          },
        }
      : {
          type: record.type,
        };
  });
};

const normalizeType = (value: unknown): string => {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();
  return normalized || "unknown";
};

const resolvers: IResolvers = {
  Query: {
    adminDatasourceDiagnostics: async (parent, args, context) => {
      ensureThatPrincipalHasServiceScope(context, ["datasource:diagnostics:read"]);

      const dashboards = await dataStore.models.Dashboard.find({})
        .select("_id visibility datasources")
        .lean();

      const brokerProfileIds = new Set<string>();
      dashboards.forEach((dashboard) => {
        const datasources = toDatasourceArray(dashboard?.datasources);
        datasources.forEach((datasource) => {
          const type = normalizeType(datasource?.type);
          if (type !== "mqtt") {
            return;
          }
          const brokerProfileId = String(datasource.settings?.brokerProfileId || "").trim();
          if (brokerProfileId) {
            brokerProfileIds.add(brokerProfileId);
          }
        });
      });

      const brokerProfiles = await dataStore.models.BrokerProfile.find({
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
      const typeCounts = new Map<string, number>();

      dashboards.forEach((dashboard) => {
        const visibility = String(dashboard?.visibility || "private")
          .trim()
          .toLowerCase();
        const datasources = toDatasourceArray(dashboard?.datasources);

        datasources.forEach((datasource) => {
          totalDatasources += 1;

          const type = normalizeType(datasource?.type);
          typeCounts.set(type, (typeCounts.get(type) || 0) + 1);
          if (!ALLOWED_DATASOURCE_TYPES.has(type)) {
            invalidDatasources += 1;
          }

          const credentialProfileId = String(datasource.settings?.credentialProfileId || "").trim();
          if (["http", "sse", "websocket"].includes(type) && credentialProfileId) {
            credentialBoundDatasources += 1;
          }
          if (type === "mqtt") {
            const brokerProfileId = String(datasource.settings?.brokerProfileId || "").trim();
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

export default resolvers;
