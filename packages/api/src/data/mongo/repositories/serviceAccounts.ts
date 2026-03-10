import type ServiceAccount from "../../../models/ServiceAccount.js";
import type { ServiceAccountRecord, ServiceAccountRepository } from "../../contracts.js";

const toRecord = (value: {
  _id?: unknown;
  name?: unknown;
  description?: unknown;
  active?: unknown;
  scopes?: unknown;
  createdByUserId?: unknown;
  lastUsedAt?: unknown;
  createdAt?: unknown;
  updatedAt?: unknown;
}): ServiceAccountRecord => ({
  _id: String(value._id || ""),
  name: String(value.name || ""),
  description: String(value.description || ""),
  active: value.active !== false,
  scopes: Array.isArray(value.scopes)
    ? value.scopes.map((scope) => String(scope || "").trim()).filter(Boolean)
    : [],
  createdByUserId: value.createdByUserId ? String(value.createdByUserId) : null,
  lastUsedAt: value.lastUsedAt ? new Date(value.lastUsedAt as Date | string | number) : null,
  createdAt: new Date(value.createdAt || Date.now()),
  updatedAt: new Date(value.updatedAt || Date.now()),
});

export const createMongoServiceAccountRepository = (
  ServiceAccountModel: typeof ServiceAccount,
): ServiceAccountRepository => ({
  listSortedByCreatedAtDesc: async () => {
    const accounts = await ServiceAccountModel.find({}).sort({ createdAt: "desc" }).lean();
    return accounts.map((account) => toRecord(account));
  },

  findById: async ({ accountId }) => {
    const account = await ServiceAccountModel.findOne({ _id: accountId }).lean();
    return account ? toRecord(account) : null;
  },

  findActiveById: async ({ accountId }) => {
    const account = await ServiceAccountModel.findOne({ _id: accountId, active: true }).lean();
    return account ? toRecord(account) : null;
  },

  create: async ({ name, description, active, scopes, createdByUserId }) => {
    const created = await new ServiceAccountModel({
      name,
      description,
      active,
      scopes,
      createdByUserId,
    }).save();

    const asObject = typeof created.toObject === "function" ? created.toObject() : created;
    return toRecord(asObject);
  },

  updateById: async ({ accountId, patch }) => {
    const updated = await ServiceAccountModel.findOneAndUpdate(
      { _id: accountId },
      { $set: patch },
      { new: true, runValidators: true },
    ).lean();
    return updated ? toRecord(updated) : null;
  },

  deleteById: async ({ accountId }) => {
    const deleted = await ServiceAccountModel.findOneAndDelete({ _id: accountId }).lean();
    return deleted ? toRecord(deleted) : null;
  },

  touchLastUsed: async ({ accountId, lastUsedAt }) => {
    await ServiceAccountModel.updateOne(
      { _id: accountId },
      {
        $set: {
          lastUsedAt,
        },
      },
    );
  },
});
