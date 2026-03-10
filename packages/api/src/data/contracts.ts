import type { ApiModelConstants, ApiModelStore, DataBackend } from "./types.js";

export type SecurityLimiterRepository = {
  incrementCounter(params: { documentId: string; expiresAt: Date }): Promise<number>;
  getLockUntil(params: { documentId: string }): Promise<Date | null>;
  upsertLock(params: { documentId: string; lockUntil: Date; expiresAt: Date }): Promise<void>;
  deleteCounterByPrefix(params: { counterPrefix: string }): Promise<void>;
  deleteById(params: { documentId: string }): Promise<void>;
};

export type ShareTokenRevocationEventRecord = {
  eventId: string;
  dashboardId: string;
  shareTokenVersion: number;
  revokedAt: Date;
  createdAt: Date;
};

export type ShareTokenRevocationRepository = {
  isReady(): Promise<boolean> | boolean;
  insertEvent(params: {
    dashboardId: string;
    shareTokenVersion: number;
    revokedAt: Date;
  }): Promise<void>;
  queryEvents(params: {
    retentionCutoff: Date;
    cursor: { createdAt: Date; eventId: string } | null;
    limit: number;
  }): Promise<ShareTokenRevocationEventRecord[]>;
};

export type DataStoreRepositories = {
  securityLimiter: SecurityLimiterRepository;
  shareTokenRevocationFeed: ShareTokenRevocationRepository;
};

export type DataStore = {
  backend: DataBackend;
  models: ApiModelStore;
  constants: ApiModelConstants;
  repositories: DataStoreRepositories;
};
