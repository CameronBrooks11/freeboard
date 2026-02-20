/**
 * @module models/ShareTokenRevocationEvent
 * Durable revocation feed entries consumed by gateway polling.
 */

import mongoose from "mongoose";

const Schema = mongoose.Schema;

const ShareTokenRevocationEventSchema = new Schema(
  {
    dashboardId: {
      type: String,
      required: true,
      index: true,
    },
    shareTokenVersion: {
      type: Number,
      required: true,
      min: 0,
      index: true,
    },
    revokedAt: {
      type: Date,
      required: true,
      index: true,
    },
  },
  {
    timestamps: true,
  },
);

ShareTokenRevocationEventSchema.index({ revokedAt: 1, _id: 1 });

export default mongoose.model("ShareTokenRevocationEvent", ShareTokenRevocationEventSchema);
