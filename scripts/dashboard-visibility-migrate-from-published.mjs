#!/usr/bin/env node

import crypto from "node:crypto";
import mongoose from "mongoose";
import { config } from "../packages/api/src/config.js";
import Dashboard from "../packages/api/src/models/Dashboard.js";

const VALID_VISIBILITIES = new Set(["private", "link", "public"]);

const parseArgs = () => {
  const args = process.argv.slice(2);
  const parsed = {
    apply: false,
    externalVisibility: "public",
  };

  for (const arg of args) {
    if (arg === "--apply") {
      parsed.apply = true;
      continue;
    }

    if (arg.startsWith("--external-visibility=")) {
      const value = arg.split("=")[1]?.trim().toLowerCase();
      if (!VALID_VISIBILITIES.has(value) || value === "private") {
        throw new Error(
          "Invalid --external-visibility value. Use 'link' or 'public'."
        );
      }
      parsed.externalVisibility = value;
      continue;
    }

    throw new Error(`Unknown argument '${arg}'`);
  }

  return parsed;
};

const hasLegacyPublishedField = (dashboard) =>
  Object.prototype.hasOwnProperty.call(dashboard ?? {}, "published");

const normalizeVisibility = (dashboard, externalVisibility) => {
  const rawVisibility = String(dashboard?.visibility ?? "")
    .trim()
    .toLowerCase();
  if (VALID_VISIBILITIES.has(rawVisibility)) {
    return rawVisibility;
  }

  if (dashboard?.published === true) {
    return externalVisibility;
  }

  return "private";
};

const ensureShareToken = (dashboard) => {
  const token = String(dashboard?.shareToken ?? "").trim();
  if (token) {
    return token;
  }
  return crypto.randomBytes(24).toString("base64url");
};

const normalizeAcl = (dashboard) =>
  Array.isArray(dashboard?.acl) ? dashboard.acl : [];

const run = async () => {
  const options = parseArgs();
  await mongoose.connect(config.mongoUrl);

  const dashboards = await Dashboard.find({}).lean();

  let changed = 0;
  const updates = [];

  for (const dashboard of dashboards) {
    const nextVisibility = normalizeVisibility(
      dashboard,
      options.externalVisibility
    );
    const nextShareToken = ensureShareToken(dashboard);
    const nextAcl = normalizeAcl(dashboard);
    const hadLegacyPublished = hasLegacyPublishedField(dashboard);

    const visibilityChanged = dashboard.visibility !== nextVisibility;
    const shareTokenChanged =
      String(dashboard.shareToken ?? "").trim() !== nextShareToken;
    const aclChanged = !Array.isArray(dashboard.acl);

    const requiresUpdate =
      visibilityChanged || shareTokenChanged || aclChanged || hadLegacyPublished;
    if (!requiresUpdate) {
      continue;
    }

    changed += 1;
    updates.push({
      _id: dashboard._id,
      set: {
        visibility: nextVisibility,
        shareToken: nextShareToken,
        acl: nextAcl,
      },
      unsetPublished: hadLegacyPublished,
    });
  }

  console.log(
    `[dashboard-visibility-migrate] dashboards=${dashboards.length} pending_updates=${changed} apply=${options.apply}`
  );

  if (options.apply) {
    for (const update of updates) {
      const $set = update.set;
      const $unset = update.unsetPublished ? { published: 1 } : undefined;
      await Dashboard.updateOne(
        { _id: update._id },
        { $set, ...($unset ? { $unset } : {}) },
        { strict: false }
      );
    }
    console.log("[dashboard-visibility-migrate] updates applied successfully");
  } else {
    console.log(
      "[dashboard-visibility-migrate] dry run only. Re-run with --apply to persist."
    );
  }

  await mongoose.disconnect();
};

run().catch(async (error) => {
  console.error(
    "[dashboard-visibility-migrate] failed:",
    error?.message || error
  );
  try {
    await mongoose.disconnect();
  } catch {
    // no-op
  }
  process.exitCode = 1;
});
