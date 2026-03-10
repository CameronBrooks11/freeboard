import { createMongoDataStore } from "./mongo/index.js";
import { createPostgresDataStore } from "./postgres/index.js";
import type { DataStore } from "./contracts.js";
import type { DataBackend } from "./types.js";
import { config } from "../config.js";

const normalizeBackend = (value: unknown): DataBackend | null => {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();
  if (normalized === "mongo" || normalized === "postgres") {
    return normalized;
  }
  return null;
};

export const resolveDataBackend = (): DataBackend =>
  normalizeBackend(config.dbBackend) || "postgres";

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
