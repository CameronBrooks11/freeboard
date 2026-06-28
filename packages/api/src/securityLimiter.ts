/**
 * @module securityLimiter
 * Shared fixed-window limiter primitives backed by datastore repositories (or memory fallback).
 */

import crypto from "node:crypto";
import { config } from "./config.js";
import { dataStore } from "./data/index.js";

type SecurityLimiterBackend = "memory" | "postgres";

type ConsumeFixedWindowParams = {
  scope: string;
  keyMaterial: unknown;
  limit: number;
  windowMs: number;
  nowMs?: number;
};

type GetLockStateParams = {
  scope: string;
  keyMaterial: unknown;
  nowMs?: number;
};

type SetLockParams = {
  scope: string;
  keyMaterial: unknown;
  ttlMs: number;
  nowMs?: number;
};

type ClearStateParams = {
  scope: string;
  keyMaterial: unknown;
};

export type ConsumeFixedWindowResult = {
  allowed: boolean;
  retryAfterMs: number;
  remaining: number;
  resetAtMs: number;
};

export type LimiterLockState = {
  blocked: boolean;
  retryAfterMs: number;
};

type MemoryCounterState = {
  count: number;
  expiresAtMs: number;
  updatedAtMs: number;
};

type MemoryLockState = {
  lockUntilMs: number;
  updatedAtMs: number;
};

const COUNTER_PREFIX = "ctr";
const LOCK_PREFIX = "lock";
const MAX_SCOPE_LENGTH = 64;
const MAX_KEY_MATERIAL_LENGTH = 512;
const MAX_KEY_PART_LENGTH = 128;
const LOCK_EXPIRY_GRACE_MS = 60_000;
const MEMORY_PRUNE_EVERY_OPERATIONS = 64;
const MIN_WINDOW_MS = 1000;
const MIN_LOCK_TTL_MS = 1000;

const memoryCounterState = new Map<string, MemoryCounterState>();
const memoryLockState = new Map<string, MemoryLockState>();
let memoryOperationCount = 0;

const limiterBackend = config.securityLimiterBackend as SecurityLimiterBackend;
const limiterNamespace = String(config.securityLimiterNamespace || "freeboard:security-limiter")
  .trim()
  .toLowerCase();
const limiterHashSalt = String(config.securityLimiterHashSalt || config.jwtSecret || "freeboard")
  .trim()
  .slice(0, 512);
const memoryMaxKeys = Math.max(1000, Number(config.securityLimiterMemoryMaxKeys) || 10000);
const persistentLimiterRepository = dataStore.repositories.securityLimiter;

const normalizeScope = (value: unknown): string => {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return (normalized || "default").slice(0, MAX_SCOPE_LENGTH);
};

const normalizeCompositePart = (value: unknown): string =>
  String(value || "")
    .trim()
    .toLowerCase()
    .slice(0, MAX_KEY_PART_LENGTH) || "unknown";

const normalizeKeyMaterial = (value: unknown): string =>
  String(value || "")
    .trim()
    .toLowerCase()
    .slice(0, MAX_KEY_MATERIAL_LENGTH) || "unknown";

const hashKeyMaterial = (value: string): string =>
  crypto.createHmac("sha256", limiterHashSalt).update(value).digest("hex");

const buildCounterDocumentPrefix = (scope: string, keyHash: string): string =>
  `${limiterNamespace}:${COUNTER_PREFIX}:${scope}:${keyHash}:`;

const buildCounterDocumentId = (scope: string, keyHash: string, bucketId: number): string =>
  `${buildCounterDocumentPrefix(scope, keyHash)}${bucketId}`;

const buildLockDocumentId = (scope: string, keyHash: string): string =>
  `${limiterNamespace}:${LOCK_PREFIX}:${scope}:${keyHash}`;

const trimMemoryMap = <T extends { updatedAtMs: number }>(
  map: Map<string, T>,
  maxKeys: number,
): void => {
  if (map.size <= maxKeys) {
    return;
  }

  const overflow = map.size - maxKeys;
  const entries = [...map.entries()].sort((a, b) => a[1].updatedAtMs - b[1].updatedAtMs);
  for (let index = 0; index < overflow; index += 1) {
    const entry = entries[index];
    if (!entry) {
      continue;
    }
    map.delete(entry[0]);
  }
};

const pruneExpiredMemoryState = (nowMs: number): void => {
  for (const [key, value] of memoryCounterState.entries()) {
    if (value.expiresAtMs <= nowMs) {
      memoryCounterState.delete(key);
    }
  }

  for (const [key, value] of memoryLockState.entries()) {
    if (value.lockUntilMs <= nowMs) {
      memoryLockState.delete(key);
    }
  }
};

const maybePruneMemoryState = (
  nowMs: number,
  { force = false }: { force?: boolean } = {},
): void => {
  memoryOperationCount += 1;
  if (!force && memoryOperationCount % MEMORY_PRUNE_EVERY_OPERATIONS !== 0) {
    return;
  }

  pruneExpiredMemoryState(nowMs);
  trimMemoryMap(memoryCounterState, memoryMaxKeys);
  trimMemoryMap(memoryLockState, memoryMaxKeys);
};

const resolveCounterResult = ({
  count,
  limit,
  resetAtMs,
  nowMs,
}: {
  count: number;
  limit: number;
  resetAtMs: number;
  nowMs: number;
}): ConsumeFixedWindowResult => {
  const allowed = count <= limit;
  if (allowed) {
    return {
      allowed: true,
      retryAfterMs: 0,
      remaining: Math.max(0, limit - count),
      resetAtMs,
    };
  }

  return {
    allowed: false,
    retryAfterMs: Math.max(1, resetAtMs - nowMs),
    remaining: 0,
    resetAtMs,
  };
};

const consumeFixedWindowMemory = ({
  documentId,
  limit,
  resetAtMs,
  nowMs,
  windowMs,
}: {
  documentId: string;
  limit: number;
  resetAtMs: number;
  nowMs: number;
  windowMs: number;
}): ConsumeFixedWindowResult => {
  maybePruneMemoryState(nowMs);

  const existing = memoryCounterState.get(documentId);
  const activeCount = existing && existing.expiresAtMs > nowMs ? existing.count : 0;
  const nextCount = activeCount + 1;
  memoryCounterState.set(documentId, {
    count: nextCount,
    expiresAtMs: resetAtMs + windowMs,
    updatedAtMs: nowMs,
  });

  return resolveCounterResult({
    count: nextCount,
    limit,
    resetAtMs,
    nowMs,
  });
};

const consumeFixedWindowPersistent = async ({
  documentId,
  limit,
  resetAtMs,
  nowMs,
  windowMs,
}: {
  documentId: string;
  limit: number;
  resetAtMs: number;
  nowMs: number;
  windowMs: number;
}): Promise<ConsumeFixedWindowResult> => {
  const count = await persistentLimiterRepository.incrementCounter({
    documentId,
    expiresAt: new Date(resetAtMs + windowMs),
  });
  return resolveCounterResult({
    count,
    limit,
    resetAtMs,
    nowMs,
  });
};

const readLockMemory = (documentId: string, nowMs: number): LimiterLockState => {
  maybePruneMemoryState(nowMs);

  const existing = memoryLockState.get(documentId);
  if (!existing || existing.lockUntilMs <= nowMs) {
    if (existing) {
      memoryLockState.delete(documentId);
    }
    return {
      blocked: false,
      retryAfterMs: 0,
    };
  }

  existing.updatedAtMs = nowMs;
  return {
    blocked: true,
    retryAfterMs: Math.max(1, existing.lockUntilMs - nowMs),
  };
};

const readLockPersistent = async (documentId: string, nowMs: number): Promise<LimiterLockState> => {
  const lockUntil = await persistentLimiterRepository.getLockUntil({ documentId });
  const lockUntilMs = Number(new Date(lockUntil || 0).getTime()) || 0;
  if (lockUntilMs <= nowMs) {
    if (lockUntil) {
      await persistentLimiterRepository.deleteById({ documentId });
    }
    return {
      blocked: false,
      retryAfterMs: 0,
    };
  }

  return {
    blocked: true,
    retryAfterMs: Math.max(1, lockUntilMs - nowMs),
  };
};

const setLockMemory = (documentId: string, lockUntilMs: number, nowMs: number): void => {
  maybePruneMemoryState(nowMs);
  memoryLockState.set(documentId, {
    lockUntilMs,
    updatedAtMs: nowMs,
  });
};

const setLockPersistent = async (documentId: string, lockUntilMs: number): Promise<void> => {
  await persistentLimiterRepository.upsertLock({
    documentId,
    lockUntil: new Date(lockUntilMs),
    expiresAt: new Date(lockUntilMs + LOCK_EXPIRY_GRACE_MS),
  });
};

const clearStateMemory = (counterPrefix: string, lockDocumentId: string, nowMs: number): void => {
  for (const key of memoryCounterState.keys()) {
    if (key.startsWith(counterPrefix)) {
      memoryCounterState.delete(key);
    }
  }
  memoryLockState.delete(lockDocumentId);
  maybePruneMemoryState(nowMs, { force: true });
};

const clearStatePersistent = async (
  counterPrefix: string,
  lockDocumentId: string,
): Promise<void> => {
  await Promise.all([
    persistentLimiterRepository.deleteCounterByPrefix({ counterPrefix }),
    persistentLimiterRepository.deleteById({ documentId: lockDocumentId }),
  ]);
};

const isPersistentRepositoryBackend = (): boolean => limiterBackend !== "memory";

/**
 * Build a stable key from untrusted/high-cardinality parts before storage hashing.
 */
export const buildLimiterCompositeKey = (...parts: unknown[]): string =>
  parts
    .map((entry) => normalizeCompositePart(entry))
    .join("|")
    .slice(0, MAX_KEY_MATERIAL_LENGTH);

/**
 * Hash one key segment before composite construction for sensitive/high-cardinality inputs.
 */
export const hashLimiterKeyPart = (value: unknown): string =>
  hashKeyMaterial(normalizeCompositePart(value)).slice(0, 32);

/**
 * Consume one fixed-window limiter token.
 */
export const consumeSecurityLimiterFixedWindow = async ({
  scope,
  keyMaterial,
  limit,
  windowMs,
  nowMs = Date.now(),
}: ConsumeFixedWindowParams): Promise<ConsumeFixedWindowResult> => {
  const normalizedLimit = Math.max(1, Math.floor(Number(limit) || 1));
  const normalizedWindowMs = Math.max(MIN_WINDOW_MS, Math.floor(Number(windowMs) || MIN_WINDOW_MS));
  const normalizedScope = normalizeScope(scope);
  const normalizedKeyMaterial = normalizeKeyMaterial(keyMaterial);
  const keyHash = hashKeyMaterial(normalizedKeyMaterial);
  const bucketId = Math.floor(nowMs / normalizedWindowMs);
  const resetAtMs = (bucketId + 1) * normalizedWindowMs;
  const documentId = buildCounterDocumentId(normalizedScope, keyHash, bucketId);

  if (isPersistentRepositoryBackend()) {
    return consumeFixedWindowPersistent({
      documentId,
      limit: normalizedLimit,
      resetAtMs,
      nowMs,
      windowMs: normalizedWindowMs,
    });
  }

  return consumeFixedWindowMemory({
    documentId,
    limit: normalizedLimit,
    resetAtMs,
    nowMs,
    windowMs: normalizedWindowMs,
  });
};

/**
 * Read temporary lock state.
 */
export const getSecurityLimiterLockState = async ({
  scope,
  keyMaterial,
  nowMs = Date.now(),
}: GetLockStateParams): Promise<LimiterLockState> => {
  const normalizedScope = normalizeScope(scope);
  const normalizedKeyMaterial = normalizeKeyMaterial(keyMaterial);
  const lockDocumentId = buildLockDocumentId(
    normalizedScope,
    hashKeyMaterial(normalizedKeyMaterial),
  );

  if (isPersistentRepositoryBackend()) {
    return readLockPersistent(lockDocumentId, nowMs);
  }

  return readLockMemory(lockDocumentId, nowMs);
};

/**
 * Set or refresh temporary lock state.
 */
export const setSecurityLimiterLock = async ({
  scope,
  keyMaterial,
  ttlMs,
  nowMs = Date.now(),
}: SetLockParams): Promise<void> => {
  const normalizedScope = normalizeScope(scope);
  const normalizedKeyMaterial = normalizeKeyMaterial(keyMaterial);
  const normalizedTtlMs = Math.max(MIN_LOCK_TTL_MS, Math.floor(Number(ttlMs) || MIN_LOCK_TTL_MS));
  const lockUntilMs = nowMs + normalizedTtlMs;
  const lockDocumentId = buildLockDocumentId(
    normalizedScope,
    hashKeyMaterial(normalizedKeyMaterial),
  );

  if (isPersistentRepositoryBackend()) {
    await setLockPersistent(lockDocumentId, lockUntilMs);
    return;
  }

  setLockMemory(lockDocumentId, lockUntilMs, nowMs);
};

/**
 * Remove lock + fixed-window counter state for a scope/key tuple.
 */
export const clearSecurityLimiterState = async ({
  scope,
  keyMaterial,
}: ClearStateParams): Promise<void> => {
  const nowMs = Date.now();
  const normalizedScope = normalizeScope(scope);
  const normalizedKeyMaterial = normalizeKeyMaterial(keyMaterial);
  const keyHash = hashKeyMaterial(normalizedKeyMaterial);
  const counterPrefix = buildCounterDocumentPrefix(normalizedScope, keyHash);
  const lockDocumentId = buildLockDocumentId(normalizedScope, keyHash);

  if (isPersistentRepositoryBackend()) {
    await clearStatePersistent(counterPrefix, lockDocumentId);
    return;
  }

  clearStateMemory(counterPrefix, lockDocumentId, nowMs);
};

/**
 * Test helper for memory backend state reset.
 */
export const resetSecurityLimiterMemoryState = (): void => {
  memoryCounterState.clear();
  memoryLockState.clear();
  memoryOperationCount = 0;
};

/**
 * Test helper to inspect memory backend key material.
 */
export const getSecurityLimiterMemoryKeys = (): {
  counterKeys: string[];
  lockKeys: string[];
} => ({
  counterKeys: [...memoryCounterState.keys()],
  lockKeys: [...memoryLockState.keys()],
});
