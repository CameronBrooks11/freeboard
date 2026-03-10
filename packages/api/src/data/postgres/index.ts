import type { DataStore } from "../contracts.js";
import { postgresModelConstants, postgresModels } from "./models.js";

export const createPostgresDataStore = (): DataStore =>
  Object.freeze({
    backend: "postgres",
    models: postgresModels,
    constants: postgresModelConstants,
  });
