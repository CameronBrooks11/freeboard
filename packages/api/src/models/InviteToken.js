/**
 * @module models/InviteToken
 * @description Mongoose model for role-scoped account invitation tokens.
 */

import mongoose from "mongoose";
import { nanoid } from "nanoid";
import { NON_ADMIN_USER_ROLES } from "../policy.js";

const Schema = mongoose.Schema;

const InviteTokenSchema = new Schema(
  {
    _id: {
      type: String,
      default: () => nanoid(),
    },
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    role: {
      type: String,
      required: true,
      enum: NON_ADMIN_USER_ROLES,
    },
    tokenHash: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    createdBy: {
      type: String,
      required: false,
      default: null,
    },
    revokedAt: {
      type: Date,
      required: false,
      default: null,
    },
    acceptedAt: {
      type: Date,
      required: false,
      default: null,
    },
    acceptedUserId: {
      type: String,
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
  }
);

InviteTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.model("InviteToken", InviteTokenSchema);
