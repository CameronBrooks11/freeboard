#!/usr/bin/env node

import crypto from "node:crypto";
import mongoose from "mongoose";
import { config } from "../packages/api/src/config.js";
import Dashboard from "../packages/api/src/models/Dashboard.js";

const parseArgs = () => {
  const args = process.argv.slice(2);
  const parsed = {
    apply: false,
    rotateTokens: true,
  };

  for (const arg of args) {
    if (arg === "--apply") {
      parsed.apply = true;
      continue;
    }
    if (arg === "--keep-tokens") {
      parsed.rotateTokens = false;
      continue;
    }
    throw new Error(`Unknown argument '${arg}'`);
  }

  return parsed;
};

const nextToken = () => crypto.randomBytes(24).toString("base64url");

const run = async () => {
  const options = parseArgs();
  await mongoose.connect(config.mongoUrl);

  const dashboards = await Dashboard.find({}).lean();

  let changed = 0;
  const updates = [];

  for (const dashboard of dashboards) {
    const currentVisibility = String(dashboard.visibility ?? "").toLowerCase();
    const set = {};
    let mustUpdate = false;

    if (currentVisibility !== "private") {
      set.visibility = "private";
      mustUpdate = true;
    }

    if (options.rotateTokens) {
      set.shareToken = nextToken();
      mustUpdate = true;
    } else if (!String(dashboard.shareToken ?? "").trim()) {
      set.shareToken = nextToken();
      mustUpdate = true;
    }

    if (!mustUpdate) {
      continue;
    }

    changed += 1;
    updates.push({ _id: dashboard._id, set });
  }

  console.log(
    `[dashboard-visibility-enforce-private] dashboards=${dashboards.length} pending_updates=${changed} apply=${options.apply} rotate_tokens=${options.rotateTokens}`
  );

  if (options.apply) {
    for (const update of updates) {
      await Dashboard.updateOne({ _id: update._id }, { $set: update.set });
    }
    console.log(
      "[dashboard-visibility-enforce-private] updates applied successfully"
    );
  } else {
    console.log(
      "[dashboard-visibility-enforce-private] dry run only. Re-run with --apply to persist."
    );
  }

  await mongoose.disconnect();
};

run().catch(async (error) => {
  console.error(
    "[dashboard-visibility-enforce-private] failed:",
    error?.message || error
  );
  try {
    await mongoose.disconnect();
  } catch {
    // no-op
  }
  process.exitCode = 1;
});
