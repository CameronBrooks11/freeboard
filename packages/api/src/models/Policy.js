/**
 * @module models/Policy
 * @description Mongoose model for mutable application policy values.
 */

import mongoose from "mongoose";

const Schema = mongoose.Schema;

const PolicySchema = new Schema(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    value: {
      type: Schema.Types.Mixed,
      required: true,
    },
    updatedBy: {
      type: String,
      required: false,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

export default mongoose.model("Policy", PolicySchema);

