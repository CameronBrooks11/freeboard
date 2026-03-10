import type SecurityLimiterState from "../../../models/SecurityLimiterState.js";
import { config } from "../../../config.js";
import type { SecurityLimiterRepository } from "../../contracts.js";

const mongoTimeoutMs = Math.max(250, Number(config.securityLimiterMongoTimeoutMs) || 2500);

export const createMongoSecurityLimiterRepository = (
  SecurityLimiterStateModel: typeof SecurityLimiterState,
): SecurityLimiterRepository => ({
  incrementCounter: async ({ documentId, expiresAt }) => {
    const updated = await SecurityLimiterStateModel.findOneAndUpdate(
      { _id: documentId },
      {
        $setOnInsert: {
          kind: "counter",
          count: 0,
        },
        $set: {
          expiresAt,
        },
        $inc: {
          count: 1,
        },
      },
      {
        upsert: true,
        new: true,
      },
    )
      .lean()
      .maxTimeMS(mongoTimeoutMs)
      .exec();

    return Math.max(0, Number(updated?.count) || 0);
  },

  getLockUntil: async ({ documentId }) => {
    const existing = await SecurityLimiterStateModel.findOne(
      {
        _id: documentId,
        kind: "lock",
      },
      {
        _id: 0,
        lockUntil: 1,
      },
    )
      .lean()
      .maxTimeMS(mongoTimeoutMs)
      .exec();

    const lockUntil = existing?.lockUntil;
    if (!(lockUntil instanceof Date)) {
      const asDate = lockUntil ? new Date(lockUntil) : null;
      return asDate && Number.isFinite(asDate.getTime()) ? asDate : null;
    }

    return lockUntil;
  },

  upsertLock: async ({ documentId, lockUntil, expiresAt }) => {
    await SecurityLimiterStateModel.findOneAndUpdate(
      { _id: documentId },
      {
        $set: {
          kind: "lock",
          lockUntil,
          expiresAt,
        },
      },
      {
        upsert: true,
        new: false,
      },
    )
      .maxTimeMS(mongoTimeoutMs)
      .exec();
  },

  deleteCounterByPrefix: async ({ counterPrefix }) => {
    await SecurityLimiterStateModel.deleteMany({
      _id: {
        $regex: new RegExp(`^${counterPrefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`),
      },
    })
      .maxTimeMS(mongoTimeoutMs)
      .exec();
  },

  deleteById: async ({ documentId }) => {
    await SecurityLimiterStateModel.deleteOne({ _id: documentId }).maxTimeMS(mongoTimeoutMs).exec();
  },
});
