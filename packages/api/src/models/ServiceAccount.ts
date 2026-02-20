/**
 * @module models/ServiceAccount
 * Mongoose model for machine-to-machine service principals.
 */

import mongoose from "mongoose";
import { nanoid } from "nanoid";
import { SERVICE_ACCOUNT_SCOPES } from "../serviceAccountScopes.js";

const Schema = mongoose.Schema;

const ServiceAccountSchema = new Schema(
  {
    _id: {
      type: String,
      default: () => nanoid(),
    },
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 3,
      maxlength: 80,
    },
    description: {
      type: String,
      required: false,
      default: "",
      trim: true,
      maxlength: 500,
    },
    active: {
      type: Boolean,
      required: true,
      default: true,
    },
    scopes: {
      type: [String],
      required: true,
      default: [],
      enum: SERVICE_ACCOUNT_SCOPES,
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

ServiceAccountSchema.index({ name: 1 }, { unique: true });

export default mongoose.model("ServiceAccount", ServiceAccountSchema);
