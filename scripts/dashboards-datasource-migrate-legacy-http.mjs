#!/usr/bin/env node

import mongoose from "mongoose";
import { config } from "../packages/api/src/config.ts";
import Dashboard from "../packages/api/src/models/Dashboard.ts";

const parseArgs = () => {
  const args = process.argv.slice(2);
  const options = {
    apply: false,
  };

  for (const arg of args) {
    if (arg === "--apply") {
      options.apply = true;
      continue;
    }
    throw new Error(`Unknown argument '${arg}'`);
  }

  return options;
};

const normalizeDatasourceType = (value) =>
  String(value || "")
    .trim()
    .toLowerCase();

const cloneDatasource = (datasource) =>
  datasource && typeof datasource === "object" ? { ...datasource } : {};

const cloneSettings = (settings) =>
  settings && typeof settings === "object" && !Array.isArray(settings) ? { ...settings } : {};

const normalizeDashboardForLegacyHttp = (dashboard) => {
  const nextDatasources = [];
  const sourceDatasources = Array.isArray(dashboard?.datasources) ? dashboard.datasources : [];

  let changed = false;
  let convertedLegacyJsonCount = 0;
  let removedLegacyAuthProviderRefsCount = 0;
  let normalizedHttpDefaultsCount = 0;

  sourceDatasources.forEach((entry) => {
    const nextEntry = cloneDatasource(entry);
    const nextSettings = cloneSettings(nextEntry.settings);

    const originalType = normalizeDatasourceType(nextEntry.type);
    if (originalType === "json") {
      nextEntry.type = "http";
      convertedLegacyJsonCount += 1;
      changed = true;
    }

    const normalizedType = normalizeDatasourceType(nextEntry.type);
    if (normalizedType === "http") {
      if (!String(nextSettings.method || "").trim()) {
        nextSettings.method = "GET";
        normalizedHttpDefaultsCount += 1;
        changed = true;
      }
      if (!String(nextSettings.parser || "").trim()) {
        nextSettings.parser = "json";
        normalizedHttpDefaultsCount += 1;
        changed = true;
      }
      if (nextSettings.useGateway === undefined) {
        nextSettings.useGateway = true;
        normalizedHttpDefaultsCount += 1;
        changed = true;
      }
    }

    if (Object.prototype.hasOwnProperty.call(nextSettings, "authProvider")) {
      delete nextSettings.authProvider;
      removedLegacyAuthProviderRefsCount += 1;
      changed = true;
    }
    if (Object.prototype.hasOwnProperty.call(nextSettings, "authProviderId")) {
      delete nextSettings.authProviderId;
      removedLegacyAuthProviderRefsCount += 1;
      changed = true;
    }

    nextEntry.settings = nextSettings;
    nextDatasources.push(nextEntry);
  });

  const hadLegacyAuthProvidersField = Object.prototype.hasOwnProperty.call(
    dashboard || {},
    "authProviders",
  );
  if (hadLegacyAuthProvidersField) {
    changed = true;
  }

  return {
    changed,
    convertedLegacyJsonCount,
    removedLegacyAuthProviderRefsCount,
    normalizedHttpDefaultsCount,
    nextDatasources,
    unsetAuthProviders: hadLegacyAuthProvidersField,
  };
};

const run = async () => {
  const options = parseArgs();

  await mongoose.connect(config.mongoUrl);

  const dashboards = await Dashboard.find({}).lean();
  const updates = [];

  let convertedLegacyJsonCount = 0;
  let removedLegacyAuthProviderRefsCount = 0;
  let normalizedHttpDefaultsCount = 0;

  for (const dashboard of dashboards) {
    const normalized = normalizeDashboardForLegacyHttp(dashboard);
    if (!normalized.changed) {
      continue;
    }

    convertedLegacyJsonCount += normalized.convertedLegacyJsonCount;
    removedLegacyAuthProviderRefsCount += normalized.removedLegacyAuthProviderRefsCount;
    normalizedHttpDefaultsCount += normalized.normalizedHttpDefaultsCount;

    updates.push({
      _id: dashboard._id,
      datasources: normalized.nextDatasources,
      unsetAuthProviders: normalized.unsetAuthProviders,
    });
  }

  console.log(
    `[dashboards-datasource-legacy-http-migrate] dashboards=${dashboards.length} pending_updates=${updates.length} converted_json=${convertedLegacyJsonCount} removed_auth_provider_refs=${removedLegacyAuthProviderRefsCount} normalized_http_defaults=${normalizedHttpDefaultsCount} apply=${options.apply}`,
  );

  if (!options.apply) {
    console.log(
      "[dashboards-datasource-legacy-http-migrate] dry run only. Re-run with --apply to persist.",
    );
    await mongoose.disconnect();
    return;
  }

  for (const update of updates) {
    const payload = {
      $set: {
        datasources: update.datasources,
      },
      ...(update.unsetAuthProviders ? { $unset: { authProviders: 1 } } : {}),
    };
    await Dashboard.updateOne({ _id: update._id }, payload, { strict: false });
  }

  console.log("[dashboards-datasource-legacy-http-migrate] updates applied successfully");

  await mongoose.disconnect();
};

run().catch(async (error) => {
  console.error("[dashboards-datasource-legacy-http-migrate] failed:", error?.message || error);
  try {
    await mongoose.disconnect();
  } catch {
    // no-op
  }
  process.exitCode = 1;
});
