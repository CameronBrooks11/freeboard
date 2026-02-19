/**
 * @module gateway/runtimeMetrics
 * @description Lightweight in-memory runtime telemetry for gateway operations.
 */

const state = {
  startedAt: new Date(),
  http: {
    requestCount: 0,
    errorCount: 0,
    latencyTotalMs: 0,
  },
  realtime: {
    connectionAttempts: 0,
    connectionsAccepted: 0,
    connectionsRejected: 0,
    activeConnections: 0,
    messagesIn: 0,
    messagesOut: 0,
    errorCount: 0,
  },
};

type HttpMetric = {
  statusCode: number;
  durationMs: number;
};

type RuntimeMetricsSnapshot = {
  startedAt: string;
  collectedAt: string;
  uptimeSeconds: number;
  httpRequestCount: number;
  httpErrorCount: number;
  httpAvgLatencyMs: number;
  realtimeConnectionAttempts: number;
  realtimeConnectionsAccepted: number;
  realtimeConnectionsRejected: number;
  realtimeActiveConnections: number;
  realtimeMessagesIn: number;
  realtimeMessagesOut: number;
  realtimeErrorCount: number;
};

export const recordGatewayHttpRequest = ({ statusCode, durationMs }: HttpMetric): void => {
  state.http.requestCount += 1;
  if (Number(statusCode) >= 500) {
    state.http.errorCount += 1;
  }
  const normalizedDuration = Number.isFinite(Number(durationMs))
    ? Math.max(0, Number(durationMs))
    : 0;
  state.http.latencyTotalMs += normalizedDuration;
};

export const recordRealtimeConnectionAttempt = (): void => {
  state.realtime.connectionAttempts += 1;
};

export const recordRealtimeConnectionAccepted = (): void => {
  state.realtime.connectionsAccepted += 1;
  state.realtime.activeConnections += 1;
};

export const recordRealtimeConnectionRejected = (): void => {
  state.realtime.connectionsRejected += 1;
};

export const recordRealtimeConnectionClosed = (): void => {
  state.realtime.activeConnections = Math.max(0, state.realtime.activeConnections - 1);
};

export const recordRealtimeMessageIn = (): void => {
  state.realtime.messagesIn += 1;
};

export const recordRealtimeMessageOut = (): void => {
  state.realtime.messagesOut += 1;
};

export const recordRealtimeError = (): void => {
  state.realtime.errorCount += 1;
};

export const getGatewayRuntimeMetricsSnapshot = (): RuntimeMetricsSnapshot => {
  const now = new Date();
  const uptimeSeconds = Math.max(0, Math.floor((now.getTime() - state.startedAt.getTime()) / 1000));
  const avgLatencyMs =
    state.http.requestCount > 0 ? state.http.latencyTotalMs / state.http.requestCount : 0;

  return {
    startedAt: state.startedAt.toISOString(),
    collectedAt: now.toISOString(),
    uptimeSeconds,
    httpRequestCount: state.http.requestCount,
    httpErrorCount: state.http.errorCount,
    httpAvgLatencyMs: Number(avgLatencyMs.toFixed(2)),
    realtimeConnectionAttempts: state.realtime.connectionAttempts,
    realtimeConnectionsAccepted: state.realtime.connectionsAccepted,
    realtimeConnectionsRejected: state.realtime.connectionsRejected,
    realtimeActiveConnections: state.realtime.activeConnections,
    realtimeMessagesIn: state.realtime.messagesIn,
    realtimeMessagesOut: state.realtime.messagesOut,
    realtimeErrorCount: state.realtime.errorCount,
  };
};
