/**
 * @module realtime/protocolAdapters
 * Realtime protocol adapter factory for SSE, WebSocket, and MQTT transports.
 */

import { URL } from "url";
import * as http from "http";
import * as https from "https";
import WebSocket from "ws";
import type * as dns from "dns";
import { createClientError } from "../errors.js";
import {
  createUpstreamRequestOptions,
  normalizeRequestHeaders,
  parseStreamPayload,
} from "../gatewayHttp.js";
import { ensureResolvedDestinationIsAllowed } from "../networkPolicy.js";
import {
  ALLOW_INSECURE_TLS,
  REALTIME_CONNECT_TIMEOUT_MS,
  REALTIME_MAX_MESSAGE_BYTES,
  REALTIME_MQTT_ENABLED,
  REALTIME_MQTT_MAX_MESSAGE_BYTES,
  REALTIME_MQTT_MAX_QOS,
  REALTIME_SSE_ENABLED,
  REALTIME_SSE_IDLE_TIMEOUT_MS,
  REALTIME_WS_ENABLED,
  REALTIME_WS_IDLE_TIMEOUT_MS,
  REALTIME_WS_PING_INTERVAL_MS,
  STREAM_ERROR_CODES,
} from "../runtimeConfig.js";

const httpRequest = http.request;
const httpsRequest = https.request;
const websocketOpenState = WebSocket.OPEN;

type StreamStatus = "connecting" | "connected" | "disconnected" | "error";
type StreamIntent = {
  protocol?: string;
  url?: string;
  parser?: string;
  headers?: Record<string, unknown>;
  protocols?: string[];
  idleTimeoutMs?: number;
  brokerUrl?: string;
  qos?: number;
  topic?: string;
  topicAllowlist?: string[];
};
type StreamAdapter = { stop: () => Promise<void> | void };
type StreamCallbacks = {
  intent: StreamIntent;
  onData: (payload: unknown) => void;
  onStatus: (status: StreamStatus) => void;
  onError: (errorCode: string, message: string) => void;
};

type MqttClientLike = {
  subscribe: (topic: string, options: { qos: number }, callback: (error?: unknown) => void) => void;
  unsubscribe: (topic: string, callback: (error?: unknown) => void) => void;
  on: (event: string, listener: (...args: unknown[]) => void) => void;
  off: (event: string, listener: (...args: unknown[]) => void) => void;
  connected: boolean;
};

type MqttPoolEntryLike = {
  client: MqttClientLike;
  topicRefCounts: Map<string, number>;
};

type ParseRealtimeTargetUrl = (params: { rawTarget: string; protocol: string }) => {
  target: URL;
  port: number;
  hostname: string;
};

type LookupFn = (hostname: string, options: dns.LookupAllOptions) => Promise<dns.LookupAddress[]>;

// Only genuine seams are injected: the per-instance MQTT pool closures, the
// DNS lookup and WebSocket-client factories (overridden in tests), and
// parseRealtimeTargetUrl (defined in index.ts, injected to avoid an import
// cycle). All other dependencies are imported directly from their modules.
type AdapterFactoryDeps<TPoolEntry extends MqttPoolEntryLike> = {
  parseRealtimeTargetUrl: ParseRealtimeTargetUrl;
  lookup: LookupFn;
  wsClientFactory: (
    url: string,
    protocols?: string | string[],
    options?: ConstructorParameters<typeof WebSocket>[2],
  ) => WebSocket;
  acquireMqttPoolEntry: (params: {
    intent: StreamIntent;
    resolvedDestination: { address: string; family: 4 | 6 };
  }) => TPoolEntry;
  releaseMqttPoolEntry: (entry: TPoolEntry) => void;
  ensureMqttTopicPolicy: (params: { intent: StreamIntent }) => void;
};

const toBufferPayload = (value: unknown): Buffer => {
  if (Buffer.isBuffer(value)) {
    return value;
  }
  if (Array.isArray(value)) {
    return Buffer.concat(
      value.map((entry) => (Buffer.isBuffer(entry) ? entry : Buffer.from(entry))),
    );
  }
  if (value instanceof ArrayBuffer) {
    return Buffer.from(value);
  }
  if (ArrayBuffer.isView(value)) {
    return Buffer.from(value.buffer, value.byteOffset, value.byteLength);
  }
  return Buffer.from(String(value));
};

/**
 * Build a protocol adapter resolver with injected gateway dependencies.
 *
 * @param {Object} deps
 * @returns {Function}
 */
export const createProtocolAdapterFactory = <TPoolEntry extends MqttPoolEntryLike>(
  deps: AdapterFactoryDeps<TPoolEntry>,
) => {
  const {
    parseRealtimeTargetUrl,
    lookup,
    wsClientFactory,
    acquireMqttPoolEntry,
    releaseMqttPoolEntry,
    ensureMqttTopicPolicy,
  } = deps;

  const createSseAdapter = async ({ intent, onData, onStatus, onError }: StreamCallbacks) => {
    const { target, port, hostname } = parseRealtimeTargetUrl({
      rawTarget: String(intent.url || ""),
      protocol: "sse",
    });
    const resolvedDestination = await ensureResolvedDestinationIsAllowed(hostname, {
      lookup,
    });

    const idleTimeoutMs = Math.max(
      1000,
      Number(intent.idleTimeoutMs) || REALTIME_SSE_IDLE_TIMEOUT_MS,
    );

    let upstreamRequest: http.ClientRequest | null = null;
    let upstreamResponse: http.IncomingMessage | null = null;
    let stopped = false;
    let idleTimer: ReturnType<typeof setTimeout> | null = null;
    let eventBuffer = "";

    const clearIdleTimer = () => {
      if (idleTimer) {
        clearTimeout(idleTimer);
        idleTimer = null;
      }
    };

    const resetIdleTimer = () => {
      clearIdleTimer();
      idleTimer = setTimeout(() => {
        if (stopped) {
          return;
        }
        onError(STREAM_ERROR_CODES.IDLE_TIMEOUT, "SSE stream idle timeout");
        stop();
      }, idleTimeoutMs);
    };

    const dispatchSseEvent = (rawEventBlock: string): void => {
      const lines = rawEventBlock.split(/\r?\n/);
      const dataLines = [];
      for (const line of lines) {
        if (line.startsWith("data:")) {
          dataLines.push(line.slice("data:".length).trimStart());
        }
      }

      if (dataLines.length === 0) {
        return;
      }

      const rawPayload = dataLines.join("\n");
      try {
        const parsedPayload = parseStreamPayload(rawPayload, intent.parser);
        onData(parsedPayload);
      } catch {
        onError(STREAM_ERROR_CODES.PROTOCOL_ERROR, "SSE payload parsing failed");
      }
    };

    const processSseBuffer = (): boolean => {
      while (true) {
        const splitCandidates = [
          eventBuffer.indexOf("\r\n\r\n"),
          eventBuffer.indexOf("\n\n"),
        ].filter((value) => value >= 0);

        if (splitCandidates.length === 0) {
          break;
        }

        const splitIndex = Math.min(...splitCandidates);
        const delimiterLength = eventBuffer.startsWith("\r\n\r\n", splitIndex) ? 4 : 2;
        const block = eventBuffer.slice(0, splitIndex);
        eventBuffer = eventBuffer.slice(splitIndex + delimiterLength);
        if (Buffer.byteLength(block, "utf8") > REALTIME_MAX_MESSAGE_BYTES) {
          onError(STREAM_ERROR_CODES.MESSAGE_TOO_LARGE, "SSE message exceeded size limit");
          stop();
          return false;
        }
        dispatchSseEvent(block);
      }

      if (Buffer.byteLength(eventBuffer, "utf8") > REALTIME_MAX_MESSAGE_BYTES) {
        onError(STREAM_ERROR_CODES.MESSAGE_TOO_LARGE, "SSE message exceeded size limit");
        stop();
        return false;
      }

      return true;
    };

    const stop = (): void => {
      if (stopped) {
        return;
      }
      stopped = true;
      clearIdleTimer();
      if (upstreamResponse && !upstreamResponse.destroyed) {
        upstreamResponse.destroy();
      }
      if (upstreamRequest && !upstreamRequest.destroyed) {
        upstreamRequest.destroy();
      }
      onStatus("disconnected");
    };

    const timeoutMs = Math.max(500, REALTIME_CONNECT_TIMEOUT_MS);
    const options = createUpstreamRequestOptions({
      target,
      port,
      hostname,
      resolvedDestination,
      bodyText: "",
      ...(intent.headers
        ? {
            headers: intent.headers,
          }
        : {}),
      timeoutMs,
    });
    options.method = "GET";

    onStatus("connecting");
    resetIdleTimer();

    const requestFn = target.protocol === "https:" ? httpsRequest : httpRequest;
    upstreamRequest = requestFn(options, (response: http.IncomingMessage) => {
      upstreamResponse = response;
      const statusCode = Number(response.statusCode) || 0;
      if (statusCode < 200 || statusCode >= 300) {
        onError(
          statusCode === 401 || statusCode === 403
            ? STREAM_ERROR_CODES.AUTH_FAILED
            : STREAM_ERROR_CODES.CONNECT_REFUSED,
          "SSE upstream rejected connection",
        );
        stop();
        return;
      }

      onStatus("connected");
      resetIdleTimer();

      response.on("data", (chunk: Buffer | string) => {
        const bufferChunk = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        if (bufferChunk.byteLength > REALTIME_MAX_MESSAGE_BYTES) {
          onError(STREAM_ERROR_CODES.MESSAGE_TOO_LARGE, "SSE message exceeded size limit");
          stop();
          return;
        }

        eventBuffer += bufferChunk.toString("utf8");
        if (!processSseBuffer()) {
          return;
        }
        resetIdleTimer();
      });

      response.on("end", () => {
        if (stopped) {
          return;
        }
        onError(STREAM_ERROR_CODES.CONNECT_FAILED, "SSE upstream stream ended");
        stop();
      });

      response.on("error", () => {
        if (stopped) {
          return;
        }
        onError(STREAM_ERROR_CODES.CONNECT_FAILED, "SSE upstream stream failed");
        stop();
      });
    });

    upstreamRequest.on("timeout", () => {
      if (stopped) {
        return;
      }
      onError(STREAM_ERROR_CODES.CONNECT_TIMEOUT, "SSE upstream connect timeout");
      stop();
    });

    upstreamRequest.on("error", () => {
      if (stopped) {
        return;
      }
      onError(STREAM_ERROR_CODES.CONNECT_FAILED, "SSE upstream connection failed");
      stop();
    });

    upstreamRequest.end();

    return { stop };
  };

  const createWebSocketAdapter = async ({ intent, onData, onStatus, onError }: StreamCallbacks) => {
    const { hostname } = parseRealtimeTargetUrl({
      rawTarget: String(intent.url || ""),
      protocol: "websocket",
    });
    const resolvedDestination = await ensureResolvedDestinationIsAllowed(hostname, {
      lookup,
    });

    const idleTimeoutMs = Math.max(
      1000,
      Number(intent.idleTimeoutMs) || REALTIME_WS_IDLE_TIMEOUT_MS,
    );

    let stopped = false;
    let idleTimer: ReturnType<typeof setTimeout> | null = null;
    let upstreamSocket: WebSocket | null = null;
    let pingTimer: ReturnType<typeof setInterval> | null = null;

    const clearIdleTimer = () => {
      if (idleTimer) {
        clearTimeout(idleTimer);
        idleTimer = null;
      }
    };

    const resetIdleTimer = () => {
      clearIdleTimer();
      idleTimer = setTimeout(() => {
        if (stopped) {
          return;
        }
        onError(STREAM_ERROR_CODES.IDLE_TIMEOUT, "WebSocket upstream idle timeout");
        stop();
      }, idleTimeoutMs);
    };

    const stop = (): void => {
      if (stopped) {
        return;
      }
      stopped = true;
      clearIdleTimer();
      if (pingTimer) {
        clearInterval(pingTimer);
        pingTimer = null;
      }
      if (upstreamSocket) {
        upstreamSocket.removeAllListeners();
        if (upstreamSocket.readyState === websocketOpenState) {
          upstreamSocket.close(1000, "subscription ended");
        } else {
          upstreamSocket.terminate();
        }
      }
      onStatus("disconnected");
    };

    onStatus("connecting");
    resetIdleTimer();

    upstreamSocket = wsClientFactory(String(intent.url || ""), intent.protocols || [], {
      headers: normalizeRequestHeaders(intent.headers),
      handshakeTimeout: REALTIME_CONNECT_TIMEOUT_MS,
      rejectUnauthorized: !ALLOW_INSECURE_TLS,
      lookup: (
        _unusedHostname: string,
        _unusedOptions: dns.LookupOptions,
        callback: (error: Error | null, address: string, family: number) => void,
      ) => {
        callback(null, resolvedDestination.address, resolvedDestination.family);
      },
    });

    upstreamSocket.on("open", () => {
      if (stopped) {
        return;
      }
      onStatus("connected");
      resetIdleTimer();
      pingTimer = setInterval(() => {
        if (!upstreamSocket || upstreamSocket.readyState !== websocketOpenState) {
          return;
        }
        upstreamSocket.ping();
      }, REALTIME_WS_PING_INTERVAL_MS);
    });

    upstreamSocket.on("message", (payload: WebSocket.RawData, isBinary: boolean) => {
      if (stopped) {
        return;
      }

      const payloadBuffer = toBufferPayload(payload);
      if (payloadBuffer.byteLength > REALTIME_MAX_MESSAGE_BYTES) {
        onError(STREAM_ERROR_CODES.MESSAGE_TOO_LARGE, "WebSocket message exceeded size limit");
        return;
      }

      const textPayload =
        isBinary || Buffer.isBuffer(payload) ? payloadBuffer.toString("utf8") : String(payload);
      try {
        const parsedPayload = parseStreamPayload(textPayload, intent.parser);
        onData(parsedPayload);
      } catch {
        onError(STREAM_ERROR_CODES.PROTOCOL_ERROR, "WebSocket payload parsing failed");
      }
      resetIdleTimer();
    });

    upstreamSocket.on("pong", () => {
      if (!stopped) {
        resetIdleTimer();
      }
    });

    upstreamSocket.on("error", () => {
      if (stopped) {
        return;
      }
      onError(STREAM_ERROR_CODES.CONNECT_FAILED, "WebSocket upstream connection failed");
      stop();
    });

    upstreamSocket.on("close", () => {
      if (stopped) {
        return;
      }
      onError(STREAM_ERROR_CODES.CONNECT_FAILED, "WebSocket upstream disconnected");
      stop();
    });

    return { stop };
  };

  const createMqttAdapter = async ({ intent, onData, onStatus, onError }: StreamCallbacks) => {
    parseRealtimeTargetUrl({ rawTarget: String(intent.brokerUrl || ""), protocol: "mqtt" });
    const mqttUrl = new URL(String(intent.brokerUrl || ""));
    const resolvedDestination = await ensureResolvedDestinationIsAllowed(mqttUrl.hostname, {
      lookup,
    });

    ensureMqttTopicPolicy({ intent });

    const qos = Math.max(0, Math.min(REALTIME_MQTT_MAX_QOS, Math.floor(Number(intent.qos) || 0)));

    const poolEntry = acquireMqttPoolEntry({
      intent,
      resolvedDestination,
    });
    const topic = String(intent.topic || "").trim();

    let stopped = false;

    const incrementTopicRef = async () => {
      const current = poolEntry.topicRefCounts.get(topic) || 0;
      if (current > 0) {
        poolEntry.topicRefCounts.set(topic, current + 1);
        return;
      }

      poolEntry.topicRefCounts.set(topic, 1);
      await new Promise<void>((resolve, reject) => {
        poolEntry.client.subscribe(topic, { qos }, (error) => {
          if (error) {
            poolEntry.topicRefCounts.delete(topic);
            reject(
              createClientError(502, "MQTT subscribe failed", STREAM_ERROR_CODES.CONNECT_FAILED),
            );
            return;
          }
          resolve();
        });
      });
    };

    const decrementTopicRef = async () => {
      const current = poolEntry.topicRefCounts.get(topic) || 0;
      if (current <= 1) {
        poolEntry.topicRefCounts.delete(topic);
        await new Promise<void>((resolve) => {
          poolEntry.client.unsubscribe(topic, () => resolve());
        });
        return;
      }

      poolEntry.topicRefCounts.set(topic, current - 1);
    };

    const onConnect = () => {
      if (!stopped) {
        onStatus("connected");
      }
    };

    const onClose = () => {
      if (!stopped) {
        onError(STREAM_ERROR_CODES.CONNECT_FAILED, "MQTT broker disconnected");
      }
    };

    const onPoolError = () => {
      if (!stopped) {
        onError(STREAM_ERROR_CODES.CONNECT_FAILED, "MQTT broker connection failed");
      }
    };

    const onMessage = (messageTopic: unknown, payload: unknown) => {
      if (stopped || messageTopic !== topic) {
        return;
      }

      const payloadBuffer = toBufferPayload(payload);
      if (payloadBuffer.byteLength > REALTIME_MQTT_MAX_MESSAGE_BYTES) {
        onError(STREAM_ERROR_CODES.MESSAGE_TOO_LARGE, "MQTT payload exceeded size limit");
        return;
      }

      try {
        const parsedPayload = parseStreamPayload(payloadBuffer.toString("utf8"), intent.parser);
        onData(parsedPayload);
      } catch {
        onError(STREAM_ERROR_CODES.PROTOCOL_ERROR, "MQTT payload parsing failed");
      }
    };

    onStatus("connecting");

    poolEntry.client.on("connect", onConnect);
    poolEntry.client.on("close", onClose);
    poolEntry.client.on("error", onPoolError);
    poolEntry.client.on("message", onMessage);

    try {
      await incrementTopicRef();
      if (poolEntry.client.connected) {
        onStatus("connected");
      }
    } catch (error) {
      poolEntry.client.off("connect", onConnect);
      poolEntry.client.off("close", onClose);
      poolEntry.client.off("error", onPoolError);
      poolEntry.client.off("message", onMessage);
      releaseMqttPoolEntry(poolEntry);
      throw error;
    }

    const stop = async () => {
      if (stopped) {
        return;
      }
      stopped = true;

      poolEntry.client.off("connect", onConnect);
      poolEntry.client.off("close", onClose);
      poolEntry.client.off("error", onPoolError);
      poolEntry.client.off("message", onMessage);

      await decrementTopicRef().catch(() => {});
      releaseMqttPoolEntry(poolEntry);
      onStatus("disconnected");
    };

    return { stop };
  };

  return async ({ intent, onData, onStatus, onError }: StreamCallbacks): Promise<StreamAdapter> => {
    const protocol = String(intent?.protocol || "").toLowerCase();

    if (protocol === "sse") {
      if (!REALTIME_SSE_ENABLED) {
        throw createClientError(403, "SSE protocol is disabled", STREAM_ERROR_CODES.POLICY_BLOCKED);
      }
      return createSseAdapter({ intent, onData, onStatus, onError });
    }

    if (protocol === "websocket") {
      if (!REALTIME_WS_ENABLED) {
        throw createClientError(
          403,
          "WebSocket protocol is disabled",
          STREAM_ERROR_CODES.POLICY_BLOCKED,
        );
      }
      return createWebSocketAdapter({ intent, onData, onStatus, onError });
    }

    if (protocol === "mqtt") {
      if (!REALTIME_MQTT_ENABLED) {
        throw createClientError(
          403,
          "MQTT protocol is disabled",
          STREAM_ERROR_CODES.POLICY_BLOCKED,
        );
      }
      return createMqttAdapter({ intent, onData, onStatus, onError });
    }

    throw createClientError(
      400,
      "Realtime protocol is not supported",
      STREAM_ERROR_CODES.POLICY_BLOCKED,
    );
  };
};
