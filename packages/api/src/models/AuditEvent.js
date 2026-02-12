/**
 * @module models/AuditEvent
 * @description Mongoose model for auditable security/policy/user events.
 */

import mongoose from "mongoose";

const Schema = mongoose.Schema;

const AuditEventSchema = new Schema(
  {
    actorUserId: {
      type: String,
      required: false,
      default: null,
    },
    action: {
      type: String,
      required: true,
      trim: true,
    },
    targetType: {
      type: String,
      required: false,
      default: null,
      trim: true,
    },
    targetId: {
      type: String,
      required: false,
      default: null,
      trim: true,
    },
    metadata: {
      type: Schema.Types.Mixed,
      required: false,
      default: {},
    },
  },
  {
    timestamps: true,
  }
);

export default mongoose.model("AuditEvent", AuditEventSchema);

