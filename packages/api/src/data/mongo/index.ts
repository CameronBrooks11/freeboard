import type { DataStore } from "../contracts.js";
import { mongoModelConstants, mongoModels } from "./models.js";
import { createMongoSecurityLimiterRepository } from "./repositories/securityLimiter.js";
import { createMongoShareTokenRevocationRepository } from "./repositories/shareTokenRevocationFeed.js";

export const createMongoDataStore = (): DataStore =>
  Object.freeze({
    backend: "mongo",
    models: mongoModels,
    constants: mongoModelConstants,
    repositories: Object.freeze({
      securityLimiter: createMongoSecurityLimiterRepository(mongoModels.SecurityLimiterState),
      shareTokenRevocationFeed: createMongoShareTokenRevocationRepository(
        mongoModels.ShareTokenRevocationEvent,
      ),
    }),
  });
