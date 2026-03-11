import { createMongoDataStore } from "./mongo/index.js";
import { createPostgresDataStore } from "./postgres/index.js";
import type { DataStore } from "./contracts.js";
import type { DataBackend } from "./types.js";
import { config } from "../config.js";

export const resolveDataBackend = (): DataBackend => {
  const normalized = String(config.dbBackend || "")
    .trim()
    .toLowerCase();
  if (normalized === "mongo") {
    return "mongo";
  }
  return "postgres";
};

const createDataStore = (): DataStore => {
  const backend = resolveDataBackend();
  if (backend === "mongo") {
    return createMongoDataStore();
  }
  return createPostgresDataStore();
};

let singletonDataStore: DataStore | null = null;

export const getDataStore = (): DataStore => {
  if (!singletonDataStore) {
    singletonDataStore = createDataStore();
  }
  return singletonDataStore;
};

export const dataStore = getDataStore();
