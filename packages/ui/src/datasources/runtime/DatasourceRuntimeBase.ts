/**
 * @module datasources/runtime/DatasourceRuntimeBase
 * @description Base runtime contract for datasource plugins.
 */

export class DatasourceRuntimeBase {
  [key: string]: any;

  /** @type {Object} */
  currentSettings: Record<string, any> = {};

  /** @type {Object} */
  metrics = {
    messageCount: 0,
    errorCount: 0,
    retryCount: 0,
  };

  /** @type {ReturnType<typeof setInterval>|null} */
  pollInterval = null;

  /** @type {ReturnType<typeof setInterval>|null} */
  staleInterval = null;

  /** @type {string} */
  status = "idle";

  /** @type {Date|null} */
  lastMessageAt = null;

  /** @type {Date|null} */
  lastUpdatedAt = null;

  /** @type {Date|null} */
  lastErrorAt = null;

  /** @type {string|null} */
  errorCode = null;

  /** @type {string|null} */
  error = null;

  /** @type {(payload: any) => void} */
  emitDataCallback;

  /** @type {(payload: any) => void} */
  emitStatusCallback;

  constructor(settings, emitDataCallback, emitStatusCallback) {
    this.emitDataCallback = emitDataCallback;
    this.emitStatusCallback = emitStatusCallback;
    this.currentSettings = settings || {};
  }

  setStatus(status: string, patch: any = {}) {
    this.status = status;
    this.emitStatus({
      status,
      ...patch,
    });
  }

  emitStatus(patch: any = {}) {
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

  emitData(payload: any) {
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
    this.setStatus("connecting");
  }

  stop() {
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
  applySettings(nextSettings: Record<string, any> = {}) {
    this.currentSettings = nextSettings;
  }

  onSettingsChanged(nextSettings: Record<string, any> = {}) {
    this.applySettings(nextSettings);
  }

  updateNow() {
    // Optional in subclasses.
  }
}
