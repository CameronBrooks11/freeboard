/**
 * @module models/ServiceAccountToken
 * @description Mongoose model for hashed, revocable service account tokens.
 */

import mongoose from "mongoose";
import { nanoid } from "nanoid";
import { SERVICE_ACCOUNT_SCOPES } from "../serviceAccountScopes.js";

const Schema = mongoose.Schema;

const ServiceAccountTokenSchema = new Schema(
  {
    _id: {
      type: String,
      default: () => nanoid(),
    },
    serviceAccountId: {
      type: String,
      required: true,
      index: true,
    },
    label: {
      type: String,
      required: false,
      default: null,
      trim: true,
      maxlength: 120,
    },
    scopes: {
      type: [String],
      required: true,
      default: [],
      enum: SERVICE_ACCOUNT_SCOPES,
    },
    tokenHash: {
      type: String,
      required: true,
    },
    tokenPrefix: {
      type: String,
      required: true,
      minlength: 4,
      maxlength: 16,
    },
    expiresAt: {
      type: Date,
      required: false,
      default: null,
      index: true,
    },
    revokedAt: {
      type: Date,
      required: false,
      default: null,
      index: true,
    },
    createdByUserId: {
      type: String,
      required: false,
      default: null,
    },
    lastUsedAt: {
      type: Date,
      required: false,
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

ServiceAccountTokenSchema.index({ serviceAccountId: 1, revokedAt: 1, expiresAt: 1 });

export default mongoose.model("ServiceAccountToken", ServiceAccountTokenSchema);
