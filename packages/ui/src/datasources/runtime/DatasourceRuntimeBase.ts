/**
 * @module datasources/runtime/DatasourceRuntimeBase
 * @description Base runtime contract for datasource plugins.
 */

import type { DatasourceStatusPayload, UnknownRecord } from "../../types/runtime.js";

export class DatasourceRuntimeBase {
  /** @type {boolean} */
  enabled = true;

  /** @type {Object} */
  currentSettings: UnknownRecord = {};

  /** @type {Object} */
  metrics = {
    messageCount: 0,
    errorCount: 0,
    retryCount: 0,
  };

  /** @type {ReturnType<typeof setInterval>|null} */
  pollInterval: ReturnType<typeof setInterval> | null = null;

  /** @type {ReturnType<typeof setInterval>|null} */
  staleInterval: ReturnType<typeof setInterval> | null = null;

  /** @type {string} */
  status = "idle";

  /** @type {Date|null} */
  lastMessageAt: Date | null = null;

  /** @type {Date|null} */
  lastUpdatedAt: Date | null = null;

  /** @type {Date|null} */
  lastErrorAt: Date | null = null;

  /** @type {string|null} */
  errorCode: string | null = null;

  /** @type {string|null} */
  error: string | null = null;

  /** @type {(payload: unknown) => void} */
  emitDataCallback: (payload: unknown) => void;

  /** @type {(payload: unknown) => void} */
  emitStatusCallback: (payload: DatasourceStatusPayload & { metrics: UnknownRecord }) => void;

  constructor(
    settings: UnknownRecord,
    emitDataCallback: (payload: unknown) => void,
    emitStatusCallback: (payload: DatasourceStatusPayload & { metrics: UnknownRecord }) => void,
  ) {
    this.emitDataCallback = emitDataCallback;
    this.emitStatusCallback = emitStatusCallback;
    this.currentSettings = settings || {};
  }

  setStatus(
    status: string,
    patch: Partial<{
      status: string;
      lastMessageAt: Date | string | number;
      lastUpdatedAt: Date | string | number;
      lastErrorAt: Date | string | number;
      errorCode: string | null;
      error: string | null;
    }> = {},
  ) {
    this.status = status;
    this.emitStatus({
      status,
      ...patch,
    });
  }

  emitStatus(
    patch: Partial<{
      status: string;
      lastMessageAt: Date | string | number;
      lastUpdatedAt: Date | string | number;
      lastErrorAt: Date | string | number;
      errorCode: string | null;
      error: string | null;
    }> = {},
  ) {
    if (patch.status) {
      this.status = patch.status;
    }
    if (patch.lastMessageAt) {
      this.lastMessageAt = new Date(patch.lastMessageAt);
    }
    if (patch.lastUpdatedAt) {
      this.lastUpdatedAt = new Date(patch.lastUpdatedAt);
    }
    if (patch.lastErrorAt) {
      this.lastErrorAt = new Date(patch.lastErrorAt);
    }
    if (patch.errorCode !== undefined) {
      this.errorCode = patch.errorCode;
    }
    if (patch.error !== undefined) {
      this.error = patch.error;
    }

    this.emitStatusCallback({
      status: this.status,
      lastMessageAt: this.lastMessageAt,
      lastUpdatedAt: this.lastUpdatedAt,
      lastErrorAt: this.lastErrorAt,
      errorCode: this.errorCode,
      error: this.error,
      metrics: { ...this.metrics },
    });
  }

  emitData(payload: unknown) {
    const now = new Date();
    this.metrics.messageCount += 1;
    this.lastMessageAt = now;
    this.lastUpdatedAt = now;
    this.errorCode = null;
    this.error = null;
    this.emitDataCallback(payload);
    this.emitStatus({
      status: "connected",
      lastMessageAt: now,
      lastUpdatedAt: now,
      errorCode: null,
      error: null,
    });
  }

  emitError(error: unknown, errorCode = "runtime_error") {
    const now = new Date();
    this.metrics.errorCount += 1;
    this.lastErrorAt = now;
    this.errorCode = errorCode;
    this.error = error instanceof Error ? error.message : String(error || "Unknown error");
    this.emitStatus({
      status: "error",
      lastErrorAt: now,
      errorCode: this.errorCode,
      error: this.error,
    });
  }

  setPollingInterval(fn: () => void, intervalMs: number) {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }

    const safeInterval = Number(intervalMs);
    if (!Number.isFinite(safeInterval) || safeInterval <= 0) {
      return;
    }

    this.pollInterval = setInterval(fn, safeInterval);
  }

  setStaleMonitor(staleAfterMs: number) {
    if (this.staleInterval) {
      clearInterval(this.staleInterval);
      this.staleInterval = null;
    }

    const thresholdMs = Number(staleAfterMs);
    if (!Number.isFinite(thresholdMs) || thresholdMs <= 0) {
      return;
    }

    this.staleInterval = setInterval(
      () => {
        if (!this.lastUpdatedAt) {
          return;
        }
        if (Date.now() - this.lastUpdatedAt.getTime() > thresholdMs) {
          this.emitStatus({ status: "stale" });
        }
      },
      Math.min(1000, Math.max(250, Math.floor(thresholdMs / 2))),
    );
  }

  start() {
    this.enabled = true;
    this.setStatus("connecting");
  }

  stop() {
    this.enabled = false;
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
    if (this.staleInterval) {
      clearInterval(this.staleInterval);
      this.staleInterval = null;
    }
    this.setStatus("idle");
  }

  dispose() {
    this.stop();
    this.setStatus("disabled");
  }

  onDispose() {
    this.dispose();
  }

  /**
   * Optional settings hook used by datasource model/runtime coordination.
   *
   * @param {Object} nextSettings
   */
  applySettings(nextSettings: UnknownRecord = {}) {
    this.currentSettings = nextSettings;
  }

  onSettingsChanged(nextSettings: UnknownRecord = {}) {
    this.applySettings(nextSettings);
  }

  updateNow() {
    // Optional in subclasses.
  }
}
