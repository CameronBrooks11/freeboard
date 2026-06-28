import { createPostgresDataStore } from "./postgres/index.js";
import type { DataStore } from "./contracts.js";

const createDataStore = (): DataStore => createPostgresDataStore();

let singletonDataStore: DataStore | null = null;

export const getDataStore = (): DataStore => {
  if (!singletonDataStore) {
    singletonDataStore = createDataStore();
  }
  return singletonDataStore;
};

export const dataStore = getDataStore();
