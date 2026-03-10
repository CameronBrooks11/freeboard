import type { DataStore } from "../contracts.js";
import { mongoModelConstants, mongoModels } from "./models.js";

export const createMongoDataStore = (): DataStore =>
  Object.freeze({
    backend: "mongo",
    models: mongoModels,
    constants: mongoModelConstants,
  });
