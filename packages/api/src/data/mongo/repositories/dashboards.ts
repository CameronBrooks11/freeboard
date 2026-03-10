import type Dashboard from "../../../models/Dashboard.js";
import type {
  DashboardAclEntryRecord,
  DashboardRecord,
  DashboardRepository,
} from "../../contracts.js";

const toDate = (value: unknown, fallback = new Date()): Date => {
  if (value instanceof Date && Number.isFinite(value.getTime())) {
    return value;
  }
  const normalized = new Date(value as Date | string | number);
  if (!Number.isFinite(normalized.getTime())) {
    return fallback;
  }
  return normalized;
};

const toAclEntries = (value: unknown): DashboardAclEntryRecord[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
        return null;
      }
      const record = entry as {
        userId?: unknown;
        accessLevel?: unknown;
        grantedBy?: unknown;
        grantedAt?: unknown;
      };
      const userId = String(record.userId || "").trim();
      if (!userId) {
        return null;
      }
      const hasGrantedBy = Object.prototype.hasOwnProperty.call(record, "grantedBy");
      const hasGrantedAt = Object.prototype.hasOwnProperty.call(record, "grantedAt");
      return {
        userId,
        accessLevel: String(record.accessLevel || "viewer"),
        ...(hasGrantedBy
          ? {
              grantedBy: record.grantedBy ? String(record.grantedBy) : null,
            }
          : {}),
        ...(hasGrantedAt
          ? {
              grantedAt: toDate(record.grantedAt),
            }
          : {}),
      };
    })
    .filter((entry): entry is DashboardAclEntryRecord => Boolean(entry));
};

const toObjectRecord = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
};

const toArray = (value: unknown): unknown[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  return value;
};

const toRecord = (value: {
  _id?: unknown;
  user?: unknown;
  version?: unknown;
  title?: unknown;
  visibility?: unknown;
  shareToken?: unknown;
  shareTokenVersion?: unknown;
  acl?: unknown;
  image?: unknown;
  datasources?: unknown;
  columns?: unknown;
  width?: unknown;
  panes?: unknown;
  settings?: unknown;
  createdAt?: unknown;
  updatedAt?: unknown;
}): DashboardRecord => ({
  _id: String(value._id || ""),
  user: String(value.user || ""),
  version: String(value.version || "1"),
  title: String(value.title || ""),
  visibility: String(value.visibility || "private"),
  shareToken: String(value.shareToken || ""),
  shareTokenVersion: Math.max(0, Math.floor(Number(value.shareTokenVersion) || 0)),
  acl: toAclEntries(value.acl),
  image: value.image ? String(value.image) : null,
  datasources: toArray(value.datasources),
  columns: Number.isFinite(Number(value.columns)) ? Math.floor(Number(value.columns)) : null,
  width: value.width ? String(value.width) : null,
  panes: toArray(value.panes),
  settings: toObjectRecord(value.settings),
  createdAt: toDate(value.createdAt),
  updatedAt: toDate(value.updatedAt, toDate(value.createdAt)),
});

export const createMongoDashboardRepository = (
  DashboardModel: typeof Dashboard,
): DashboardRepository => ({
  findById: async ({ dashboardId }) => {
    const dashboard = await DashboardModel.findOne({ _id: dashboardId }).lean();
    return dashboard ? toRecord(dashboard) : null;
  },

  findByShareToken: async ({ shareToken }) => {
    const dashboard = await DashboardModel.findOne({ shareToken }).lean();
    return dashboard ? toRecord(dashboard) : null;
  },

  listAll: async () => {
    const dashboards = await DashboardModel.find({}).lean();
    return dashboards.map((dashboard) => toRecord(dashboard));
  },

  listAccessible: async ({ viewerUserId, includePublic }) => {
    const scopedFilters: Record<string, unknown>[] = [
      { user: viewerUserId },
      { acl: { $elemMatch: { userId: viewerUserId } } },
    ];
    if (includePublic) {
      scopedFilters.push({ visibility: "public" });
    }

    const dashboards = await DashboardModel.find({
      $or: scopedFilters,
    }).lean();

    return dashboards.map((dashboard) => toRecord(dashboard));
  },

  listForDiagnostics: async () => {
    const dashboards = await DashboardModel.find({}).select("_id visibility datasources").lean();

    return dashboards.map((dashboard) => ({
      _id: String(dashboard?._id || ""),
      visibility: String(dashboard?.visibility || "private"),
      datasources: toArray(dashboard?.datasources),
    }));
  },

  findImpactedByUserId: async ({ userId }) => {
    const dashboards = await DashboardModel.find({
      $or: [{ user: userId }, { acl: { $elemMatch: { userId } } }],
    }).lean();

    return dashboards.map((dashboard) => toRecord(dashboard));
  },

  create: async ({
    title,
    version,
    visibility,
    user,
    shareToken,
    shareTokenVersion,
    acl,
    image,
    datasources,
    columns,
    width,
    panes,
    settings,
  }) => {
    const created = await new DashboardModel({
      title,
      version,
      visibility,
      user,
      ...(shareToken === undefined ? {} : { shareToken }),
      ...(shareTokenVersion === undefined ? {} : { shareTokenVersion }),
      ...(acl === undefined ? {} : { acl }),
      ...(image === undefined ? {} : { image }),
      ...(datasources === undefined ? {} : { datasources }),
      ...(columns === undefined ? {} : { columns }),
      ...(width === undefined ? {} : { width }),
      ...(panes === undefined ? {} : { panes }),
      ...(settings === undefined ? {} : { settings }),
    }).save();

    const createdId =
      created && typeof created === "object" && "_id" in created ? (created._id as unknown) : null;
    const persisted = createdId ? await DashboardModel.findOne({ _id: createdId }).lean() : null;
    if (persisted) {
      return toRecord(persisted);
    }

    const asObject = typeof created.toObject === "function" ? created.toObject() : created;
    return toRecord(asObject as Record<string, unknown>);
  },

  updateById: async ({ dashboardId, patch }) => {
    const updated = await DashboardModel.findOneAndUpdate(
      { _id: dashboardId },
      {
        $set: patch,
      },
      {
        new: true,
        runValidators: true,
      },
    ).lean();

    return updated ? toRecord(updated) : null;
  },

  deleteById: async ({ dashboardId }) => {
    const deleted = await DashboardModel.findOneAndDelete({ _id: dashboardId }).lean();
    return deleted ? toRecord(deleted) : null;
  },
});
