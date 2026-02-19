/**
 * @module datasources/runtime/StreamingManager
 * @description Shared dashboard-level websocket transport manager for realtime datasources.
 */

const REALTIME_RECONNECT_MIN_MS = 1000;
const REALTIME_RECONNECT_MAX_MS = 30000;
const HEARTBEAT_INTERVAL_MS = 30000;
const ACK_TIMEOUT_MS = 10000;

type StreamingMessage = Record<string, unknown> & {
  type?: string;
  requestId?: string;
  ok?: boolean;
  message?: string;
  datasourceId?: string;
  status?: string;
  errorCode?: string;
  timestamp?: string;
  payload?: unknown;
};

type PendingAck = {
  resolve: (value: unknown) => void;
  reject: (reason?: unknown) => void;
  timeoutId: ReturnType<typeof setTimeout>;
};

type StreamingSubscriptionCallbacks = {
  onData?: (message: StreamingMessage) => void;
  onStatus?: (message: StreamingMessage) => void;
  onError?: (message: StreamingMessage) => void;
  onTokenExpiring?: () => void;
};

type StreamingSubscription = {
  datasourceId: string;
  dashboardId: string;
  sessionToken: string;
  callbacks: StreamingSubscriptionCallbacks;
  expiresAtMs: number | null;
  tokenExpiryTimer: ReturnType<typeof setTimeout> | null;
};

const managerByDashboardId = new Map<string, StreamingManager>();

const decodeBase64 = (value: string): string => {
  if (typeof globalThis.atob === "function") {
    return globalThis.atob(value);
  }
  const maybeBuffer = (
    globalThis as typeof globalThis & {
      Buffer?: {
        from: (input: string, encoding: string) => { toString: (encoding: string) => string };
      };
    }
  ).Buffer;
  if (typeof maybeBuffer !== "undefined") {
    return maybeBuffer.from(value, "base64").toString("utf8");
  }
  return "";
};

const parseJwtPayload = (token: string | null | undefined): Record<string, unknown> | null => {
  if (!token || typeof token !== "string") {
    return null;
  }

  const payloadSegment = token.split(".")[1];
  if (!payloadSegment) {
    return null;
  }

  const normalizedBase64 = payloadSegment
    .replace(/-/g, "+")
    .replace(/_/g, "/")
    .padEnd(Math.ceil(payloadSegment.length / 4) * 4, "=");

  try {
    return JSON.parse(decodeBase64(normalizedBase64));
  } catch {
    return null;
  }
};

const getTokenExpiry = (token: string | null | undefined): number | null => {
  const payload = parseJwtPayload(token);
  const exp = Number(payload?.exp);
  if (!Number.isFinite(exp)) {
    return null;
  }
  return exp * 1000;
};

const buildRealtimeSocketUrl = () => {
  const protocol = window.location.protocol === "https:" ? "wss" : "ws";
  return `${protocol}://${window.location.host}/gateway/realtime`;
};

export class StreamingManager {
  dashboardId: string | null = null;

  socket: WebSocket | null = null;

  connectPromise: Promise<void> | null = null;

  reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  reconnectAttempts = 0;

  heartbeatTimer: ReturnType<typeof setInterval> | null = null;

  requestCounter = 0;

  disposed = false;

  subscriptions = new Map<string, StreamingSubscription>();

  pendingAcks = new Map<string, PendingAck>();

  constructor(dashboardId: string | null = null) {
    this.dashboardId = dashboardId || null;
  }

  nextRequestId() {
    this.requestCounter += 1;
    return `rt-${Date.now()}-${this.requestCounter}`;
  }

  setDashboardId(nextDashboardId: string | null) {
    this.dashboardId = nextDashboardId || null;
  }

  ensureSocketOpen() {
    if (this.disposed) {
      return Promise.reject(new Error("Streaming manager is disposed"));
    }

    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      return Promise.resolve();
    }

    if (this.connectPromise) {
      return this.connectPromise;
    }

    this.connectPromise = new Promise<void>((resolve, reject) => {
      const socket = new WebSocket(buildRealtimeSocketUrl());
      this.socket = socket;

      socket.addEventListener(
        "open",
        () => {
          this.reconnectAttempts = 0;
          this.startHeartbeat();
          void this.replaySubscriptions();
          resolve();
        },
        { once: true },
      );

      socket.addEventListener(
        "error",
        () => {
          if (socket.readyState !== WebSocket.OPEN) {
            reject(new Error("Realtime connection failed"));
          }
        },
        { once: true },
      );

      socket.addEventListener("message", (event) => {
        this.handleMessage(event.data);
      });

      socket.addEventListener("close", () => {
        this.stopHeartbeat();
        this.failPendingAcks(new Error("Realtime connection closed"));
        this.connectPromise = null;
        this.socket = null;

        if (!this.disposed && this.subscriptions.size > 0) {
          this.scheduleReconnect();
        }
      });
    });

    return this.connectPromise;
  }

  scheduleReconnect() {
    if (this.reconnectTimer || this.disposed) {
      return;
    }

    this.reconnectAttempts += 1;
    const delay = Math.min(
      REALTIME_RECONNECT_MAX_MS,
      REALTIME_RECONNECT_MIN_MS * 2 ** (this.reconnectAttempts - 1),
    );

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.ensureSocketOpen().catch(() => {
        this.scheduleReconnect();
      });
    }, delay);
  }

  startHeartbeat() {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      this.sendMessage({
        type: "ping",
        requestId: this.nextRequestId(),
      });
    }, HEARTBEAT_INTERVAL_MS);
  }

  stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  failPendingAcks(error: Error) {
    for (const [requestId, pending] of this.pendingAcks.entries()) {
      clearTimeout(pending.timeoutId);
      pending.reject(error);
      this.pendingAcks.delete(requestId);
    }
  }

  sendMessage(payload: StreamingMessage): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      throw new Error("Realtime socket is not connected");
    }
    this.socket.send(JSON.stringify(payload));
  }

  sendRequest(payload: StreamingMessage): Promise<unknown> {
    const requestId = String(payload.requestId || this.nextRequestId());

    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.pendingAcks.delete(requestId);
        reject(new Error("Realtime request timed out"));
      }, ACK_TIMEOUT_MS);

      this.pendingAcks.set(requestId, {
        resolve,
        reject,
        timeoutId,
      });

      try {
        this.sendMessage({
          ...payload,
          requestId,
        });
      } catch (error) {
        clearTimeout(timeoutId);
        this.pendingAcks.delete(requestId);
        reject(error);
      }
    });
  }

  scheduleTokenExpiryCallback(subscription: StreamingSubscription): void {
    if (subscription.tokenExpiryTimer) {
      clearTimeout(subscription.tokenExpiryTimer);
      subscription.tokenExpiryTimer = null;
    }

    if (!subscription.expiresAtMs || !subscription.callbacks.onTokenExpiring) {
      return;
    }

    const leadMs = 60_000;
    const delayMs = Math.max(0, subscription.expiresAtMs - Date.now() - leadMs);
    subscription.tokenExpiryTimer = setTimeout(() => {
      subscription.callbacks.onTokenExpiring?.();
    }, delayMs);
  }

  async replaySubscriptions() {
    for (const subscription of this.subscriptions.values()) {
      try {
        await this.sendSubscribe(subscription);
      } catch (error) {
        subscription.callbacks.onError?.({
          datasourceId: subscription.datasourceId,
          errorCode: "STREAM_CONNECT_FAILED",
          message:
            (error && typeof error === "object" && "message" in error
              ? String((error as { message?: string }).message || "")
              : "") || "Realtime subscription replay failed",
        });
      }
    }
  }

  async sendSubscribe(subscription: StreamingSubscription): Promise<void> {
    await this.sendRequest({
      type: "subscribe",
      dashboardId: subscription.dashboardId,
      datasourceId: subscription.datasourceId,
      sessionToken: subscription.sessionToken,
    });

    this.scheduleTokenExpiryCallback(subscription);
  }

  handleMessage(rawMessage: unknown): void {
    let message: StreamingMessage;
    try {
      message = JSON.parse(String(rawMessage || ""));
    } catch {
      return;
    }

    const type = String(message.type || "").toLowerCase();
    if (type === "ack") {
      const requestId = String(message.requestId || "");
      const pending = this.pendingAcks.get(requestId);
      if (!pending) {
        return;
      }

      clearTimeout(pending.timeoutId);
      this.pendingAcks.delete(requestId);

      if (message.ok) {
        pending.resolve(message);
      } else {
        pending.reject(new Error(String(message.message || "Realtime request rejected")));
      }
      return;
    }

    if (type === "data") {
      const datasourceId = String(message.datasourceId || "").trim();
      const subscription = this.subscriptions.get(datasourceId);
      subscription?.callbacks.onData?.(message);
      return;
    }

    if (type === "status") {
      const datasourceId = String(message.datasourceId || "").trim();
      const subscription = this.subscriptions.get(datasourceId);
      subscription?.callbacks.onStatus?.(message);
      return;
    }

    if (type === "error") {
      const datasourceId = String(message.datasourceId || "").trim();
      const subscription = this.subscriptions.get(datasourceId);
      subscription?.callbacks.onError?.(message);
      return;
    }
  }

  async subscribe({
    datasourceId,
    dashboardId,
    sessionToken,
    callbacks,
  }: {
    datasourceId: string;
    dashboardId: string;
    sessionToken: string;
    callbacks?: StreamingSubscriptionCallbacks;
  }): Promise<void> {
    if (!datasourceId || !dashboardId || !sessionToken) {
      throw new Error("Realtime subscribe requires dashboardId, datasourceId, and sessionToken");
    }

    const subscription: StreamingSubscription = {
      datasourceId,
      dashboardId,
      sessionToken,
      callbacks: callbacks || {},
      expiresAtMs: getTokenExpiry(sessionToken),
      tokenExpiryTimer: null,
    };

    this.subscriptions.set(datasourceId, subscription);

    try {
      await this.ensureSocketOpen();
      await this.sendSubscribe(subscription);
    } catch (error) {
      this.subscriptions.delete(datasourceId);
      throw error;
    }
  }

  async refreshToken(datasourceId: string, sessionToken: string): Promise<void> {
    const subscription = this.subscriptions.get(datasourceId);
    if (!subscription) {
      throw new Error("Realtime subscription not found");
    }

    subscription.sessionToken = sessionToken;
    subscription.expiresAtMs = getTokenExpiry(sessionToken);

    await this.ensureSocketOpen();
    await this.sendSubscribe(subscription);
  }

  async unsubscribe(datasourceId: string): Promise<void> {
    const subscription = this.subscriptions.get(datasourceId);
    if (!subscription) {
      return;
    }

    this.subscriptions.delete(datasourceId);
    if (subscription.tokenExpiryTimer) {
      clearTimeout(subscription.tokenExpiryTimer);
      subscription.tokenExpiryTimer = null;
    }

    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      try {
        await this.sendRequest({
          type: "unsubscribe",
          dashboardId: subscription.dashboardId,
          datasourceId,
        });
      } catch {
        // Ignore unsubscribe failures when connection is unstable.
      }
    }

    if (this.subscriptions.size === 0) {
      this.closeSocket();
    }
  }

  closeSocket() {
    this.stopHeartbeat();

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.socket) {
      if (this.socket.readyState === WebSocket.OPEN) {
        this.socket.close();
      }
      this.socket = null;
    }

    this.connectPromise = null;
  }

  dispose() {
    this.disposed = true;
    for (const subscription of this.subscriptions.values()) {
      if (subscription.tokenExpiryTimer) {
        clearTimeout(subscription.tokenExpiryTimer);
        subscription.tokenExpiryTimer = null;
      }
    }
    this.subscriptions.clear();
    this.failPendingAcks(new Error("Streaming manager disposed"));
    this.closeSocket();
  }
}

export const getStreamingManager = (dashboardId: string | null = null): StreamingManager => {
  const key = dashboardId || "default";
  let manager = managerByDashboardId.get(key);
  if (!manager) {
    manager = new StreamingManager(key === "default" ? null : key);
    managerByDashboardId.set(key, manager);
  }
  return manager;
};

export const disposeStreamingManager = (dashboardId: string | null = null): void => {
  const key = dashboardId || "default";
  const manager = managerByDashboardId.get(key);
  if (!manager) {
    return;
  }

  manager.dispose();
  managerByDashboardId.delete(key);
};

export const disposeAllStreamingManagers = (): void => {
  for (const [key, manager] of managerByDashboardId.entries()) {
    manager.dispose();
    managerByDashboardId.delete(key);
  }
};
