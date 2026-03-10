import type User from "../../../models/User.js";
import type { UserRecord, UserRepository } from "../../contracts.js";

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

const toRecord = (value: {
  _id?: unknown;
  email?: unknown;
  password?: unknown;
  role?: unknown;
  active?: unknown;
  sessionVersion?: unknown;
  registrationDate?: unknown;
  lastLogin?: unknown;
  createdAt?: unknown;
  updatedAt?: unknown;
}): UserRecord => ({
  _id: String(value._id || ""),
  email: String(value.email || ""),
  password: String(value.password || ""),
  role: String(value.role || "viewer"),
  active: value.active !== false,
  sessionVersion: Math.max(0, Math.floor(Number(value.sessionVersion) || 0)),
  registrationDate: toDate(value.registrationDate),
  lastLogin: toDate(value.lastLogin),
  createdAt: toDate(value.createdAt),
  updatedAt: toDate(value.updatedAt, toDate(value.createdAt)),
});

const toCount = (value: unknown): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return 0;
  }
  return Math.max(0, Math.floor(parsed));
};

export const createMongoUserRepository = (UserModel: typeof User): UserRepository => ({
  listAll: async () => {
    const users = await UserModel.find().lean();
    return users.map((user) => toRecord(user));
  },

  countAll: async () => {
    const count = await UserModel.estimatedDocumentCount();
    return toCount(count);
  },

  countActiveAdminsExcludingUser: async ({ excludedUserId }) => {
    const count = await UserModel.countDocuments({
      role: "admin",
      active: true,
      _id: { $ne: excludedUserId },
    });
    return toCount(count);
  },

  findFirstActiveAdmin: async ({ excludedUserId = null }) => {
    const filter: Record<string, unknown> = {
      role: "admin",
      active: true,
    };
    if (excludedUserId) {
      filter._id = { $ne: excludedUserId };
    }
    const user = await UserModel.findOne(filter).sort({ registrationDate: 1 }).lean();
    return user ? toRecord(user) : null;
  },

  findByIds: async ({ userIds }) => {
    const normalizedIds = userIds.map((entry) => String(entry || "").trim()).filter(Boolean);
    if (!normalizedIds.length) {
      return [];
    }

    const users = await UserModel.find({ _id: { $in: normalizedIds } })
      .select("_id email")
      .lean();
    return users.map((user) => toRecord(user));
  },

  findById: async ({ userId }) => {
    const user = await UserModel.findOne({ _id: userId }).lean();
    return user ? toRecord(user) : null;
  },

  findActiveById: async ({ userId }) => {
    const user = await UserModel.findOne({ _id: userId, active: true }).lean();
    return user ? toRecord(user) : null;
  },

  findByEmail: async ({ email }) => {
    const user = await UserModel.findOne({ email }).lean();
    return user ? toRecord(user) : null;
  },

  findActiveByEmail: async ({ email }) => {
    const user = await UserModel.findOne({ email, active: true }).lean();
    return user ? toRecord(user) : null;
  },

  create: async ({ email, password, role, active }) => {
    const created = await new UserModel({
      email,
      password,
      role,
      active,
    }).save();

    const createdId =
      created && typeof created === "object" && "_id" in created ? (created._id as unknown) : null;
    const persisted = createdId ? await UserModel.findOne({ _id: createdId }).lean() : null;
    if (persisted) {
      return toRecord(persisted);
    }

    const asObject = typeof created.toObject === "function" ? created.toObject() : created;
    return toRecord(asObject as Record<string, unknown>);
  },

  updateById: async ({ userId, patch, incrementSessionVersion = false }) => {
    const updatePayload: Record<string, unknown> = {
      $set: patch,
    };
    if (incrementSessionVersion) {
      updatePayload.$inc = { sessionVersion: 1 };
    }

    const updated = await UserModel.findOneAndUpdate({ _id: userId }, updatePayload, {
      new: true,
      runValidators: true,
    }).lean();

    return updated ? toRecord(updated) : null;
  },

  deleteById: async ({ userId }) => {
    const deleted = await UserModel.findOneAndDelete({ _id: userId }).lean();
    return deleted ? toRecord(deleted) : null;
  },

  touchLastLogin: async ({ userId, lastLogin }) => {
    await UserModel.findOneAndUpdate(
      { _id: userId },
      {
        $set: {
          lastLogin,
        },
      },
      {
        new: false,
      },
    ).lean();
  },

  setPasswordAndIncrementSessionVersion: async ({ userId, password }) => {
    const user = await UserModel.findOne({ _id: userId });
    if (!user) {
      return null;
    }

    user.password = password;
    user.sessionVersion = Math.max(0, Math.floor(Number(user.sessionVersion) || 0)) + 1;
    const saved = await user.save();
    const asObject = typeof saved.toObject === "function" ? saved.toObject() : saved;
    return toRecord(asObject);
  },
});
