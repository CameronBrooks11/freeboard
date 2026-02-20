/**
 * @module models/BrokerProfile
 * Mongoose model for realtime broker connection metadata.
 */

import mongoose from "mongoose";
import { nanoid } from "nanoid";

const Schema = mongoose.Schema;

export const BROKER_PROFILE_PROTOCOLS = Object.freeze(["mqtt"]);

const normalizeTopicAllowlist = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((entry) => String(entry || "").trim()).filter(Boolean);
};

const BrokerProfileSchema = new Schema(
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
    protocol: {
      type: String,
      required: true,
      enum: BROKER_PROFILE_PROTOCOLS,
      default: "mqtt",
      index: true,
    },
    brokerUrl: {
      type: String,
      required: true,
      trim: true,
    },
    tls: {
      type: Object,
      required: false,
      default: {},
    },
    credentialProfileId: {
      type: String,
      required: false,
      default: null,
      index: true,
    },
    allowPublicUse: {
      type: Boolean,
      required: true,
      default: false,
      index: true,
    },
    topicAllowlist: {
      type: [String],
      required: true,
      default: [],
      set: normalizeTopicAllowlist,
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

BrokerProfileSchema.index({ name: 1 }, { unique: true });
BrokerProfileSchema.index({ protocol: 1, brokerUrl: 1 });

export default mongoose.model("BrokerProfile", BrokerProfileSchema);
