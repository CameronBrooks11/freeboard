/**
 * @module runtimeMetrics
 * @description Lightweight in-memory runtime telemetry for API operational visibility.
 */

const LATENCY_WINDOW_SIZE = 512;

const state = {
  startedAt: new Date(),
  http: {
    requestCount: 0,
    errorCount: 0,
    latencyTotalMs: 0,
    latencyMaxMs: 0,
    recentLatencyMs: [],
  },
  auth: {
    failureCount: 0,
  },
  datasource: {
    mintSuccessCount: 0,
    mintFailureCount: 0,
  },
  audit: {
    writeFailureCount: 0,
  },
};

const percentile = (sortedValues, ratio) => {
  if (!sortedValues.length) {
    return 0;
  }
  const index = Math.max(
    0,
    Math.min(sortedValues.length - 1, Math.ceil(sortedValues.length * ratio) - 1),
  );
  return sortedValues[index];
};

export const recordApiHttpRequest = ({ statusCode, durationMs }) => {
  state.http.requestCount += 1;
  if (Number(statusCode) >= 500) {
    state.http.errorCount += 1;
  }

  const normalizedDuration = Number.isFinite(Number(durationMs))
    ? Math.max(0, Number(durationMs))
    : 0;
  state.http.latencyTotalMs += normalizedDuration;
  state.http.latencyMaxMs = Math.max(state.http.latencyMaxMs, normalizedDuration);
  state.http.recentLatencyMs.push(normalizedDuration);
  if (state.http.recentLatencyMs.length > LATENCY_WINDOW_SIZE) {
    state.http.recentLatencyMs.shift();
  }
};

export const recordAuthFailureMetric = () => {
  state.auth.failureCount += 1;
};

export const recordDatasourceMintMetric = ({ ok }) => {
  if (ok) {
    state.datasource.mintSuccessCount += 1;
    return;
  }
  state.datasource.mintFailureCount += 1;
};

export const recordAuditWriteFailureMetric = () => {
  state.audit.writeFailureCount += 1;
};

export const getApiRuntimeMetricsSnapshot = () => {
  const now = new Date();
  const uptimeSeconds = Math.max(0, Math.floor((now.getTime() - state.startedAt.getTime()) / 1000));
  const avgLatencyMs =
    state.http.requestCount > 0 ? state.http.latencyTotalMs / state.http.requestCount : 0;
  const sortedLatency = [...state.http.recentLatencyMs].sort((a, b) => a - b);
  const p95LatencyMs = percentile(sortedLatency, 0.95);

  return {
    startedAt: state.startedAt.toISOString(),
    collectedAt: now.toISOString(),
    uptimeSeconds,
    requestCount: state.http.requestCount,
    errorCount: state.http.errorCount,
    avgLatencyMs: Number(avgLatencyMs.toFixed(2)),
    p95LatencyMs: Number(p95LatencyMs.toFixed(2)),
    maxLatencyMs: Number(state.http.latencyMaxMs.toFixed(2)),
    authFailureCount: state.auth.failureCount,
    datasourceMintSuccessCount: state.datasource.mintSuccessCount,
    datasourceMintFailureCount: state.datasource.mintFailureCount,
    auditWriteFailureCount: state.audit.writeFailureCount,
  };
};
