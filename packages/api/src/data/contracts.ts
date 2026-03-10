import type { ApiModelConstants, ApiModelStore, DataBackend } from "./types.js";

export type DataStore = {
  backend: DataBackend;
  models: ApiModelStore;
  constants: ApiModelConstants;
};
