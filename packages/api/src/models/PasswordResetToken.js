/**
 * @module models/PasswordResetToken
 * @description Mongoose model for one-time password reset tokens.
 */

import mongoose from "mongoose";
import { nanoid } from "nanoid";

const Schema = mongoose.Schema;

const PasswordResetTokenSchema = new Schema(
  {
    _id: {
      type: String,
      default: () => nanoid(),
    },
    userId: {
      type: String,
      required: true,
      index: true,
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
    requestedByEmail: {
      type: String,
      required: false,
      default: null,
    },
    revokedAt: {
      type: Date,
      required: false,
      default: null,
    },
    usedAt: {
      type: Date,
      required: false,
      default: null,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

PasswordResetTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.model("PasswordResetToken", PasswordResetTokenSchema);
