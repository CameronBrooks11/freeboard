/**
 * @module models/SecurityLimiterState
 * Shared TTL-backed limiter state for counters and temporary locks.
 */

import mongoose from "mongoose";

const Schema = mongoose.Schema;

const SecurityLimiterStateSchema = new Schema(
  {
    _id: {
      type: String,
      required: true,
    },
    kind: {
      type: String,
      required: true,
      enum: ["counter", "lock"],
      index: true,
    },
    count: {
      type: Number,
      required: false,
      default: 0,
      min: 0,
    },
    lockUntil: {
      type: Date,
      required: false,
      default: null,
    },
    expiresAt: {
      type: Date,
      required: true,
      index: true,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

SecurityLimiterStateSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.model("SecurityLimiterState", SecurityLimiterStateSchema);
