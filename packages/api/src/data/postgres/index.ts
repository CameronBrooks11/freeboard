import type { DataStore } from "../contracts.js";
import { postgresModelConstants, postgresModels } from "./models.js";
import { createPostgresSecurityLimiterRepository } from "./repositories/securityLimiter.js";
import { createPostgresShareTokenRevocationRepository } from "./repositories/shareTokenRevocationFeed.js";

export const createPostgresDataStore = (): DataStore =>
  Object.freeze({
    backend: "postgres",
    models: postgresModels,
    constants: postgresModelConstants,
    repositories: Object.freeze({
      securityLimiter: createPostgresSecurityLimiterRepository(),
      shareTokenRevocationFeed: createPostgresShareTokenRevocationRepository(),
    }),
  });
