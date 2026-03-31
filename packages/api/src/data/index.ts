import { createPostgresDataStore } from "./postgres/index.js";
import type { DataStore } from "./contracts.js";
import type { DataBackend } from "./types.js";

export const resolveDataBackend = (): DataBackend => "postgres";

const createDataStore = (): DataStore => createPostgresDataStore();

let singletonDataStore: DataStore | null = null;

export const getDataStore = (): DataStore => {
  if (!singletonDataStore) {
    singletonDataStore = createDataStore();
  }
  return singletonDataStore;
};

export const dataStore = getDataStore();
