/**
 * @module models/CredentialProfile
 * @description Mongoose model for server-managed datasource credential profiles.
 */

import mongoose from "mongoose";
import { nanoid } from "nanoid";

const Schema = mongoose.Schema;

export const CREDENTIAL_PROFILE_TYPES = Object.freeze(["none", "header", "bearer", "basic"]);

const CredentialProfileSchema = new Schema(
  {
    _id: {
      type: String,
      default: () => nanoid(),
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      required: false,
      default: "",
      trim: true,
    },
    type: {
      type: String,
      required: true,
      enum: CREDENTIAL_PROFILE_TYPES,
      default: "none",
      index: true,
    },
    allowPublicUse: {
      type: Boolean,
      required: true,
      default: false,
      index: true,
    },
    metadata: {
      type: Object,
      required: false,
      default: {},
    },
    secret: {
      type: Object,
      required: false,
      default: {},
    },
    createdBy: {
      type: String,
      required: false,
      default: null,
    },
    updatedBy: {
      type: String,
      required: false,
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

CredentialProfileSchema.index({ name: 1 }, { unique: true });

export default mongoose.model("CredentialProfile", CredentialProfileSchema);
