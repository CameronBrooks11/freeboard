/**
 * @module realtime/SimpleMqttClient
 * @description Lightweight MQTT client with reconnect and subscribe management for gateway pooling.
 */

import crypto from "node:crypto";
import { EventEmitter } from "node:events";
import net from "net";
import tls from "node:tls";
import { URL } from "url";
import {
  buildMqttConnectPacket,
  buildMqttDisconnectPacket,
  buildMqttPingPacket,
  buildMqttPubAckPacket,
  buildMqttSubscribePacket,
  buildMqttUnsubscribePacket,
  decodeMqttRemainingLength,
} from "./mqttCodec.js";

const createClientError = (statusCode, message) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

export class SimpleMqttClient extends EventEmitter {
  brokerUrl;

  username;

  password;

  resolvedAddress;

  resolvedFamily;

  tlsServername;

  keepaliveSeconds;

  connectTimeoutMs;

  reconnectMinMs;

  reconnectMaxMs;

  tlsOptions;

  socket = null;

  connected = false;

  closed = false;

  packetId = 1;

  reconnectAttempt = 0;

  reconnectTimer = null;

  connectTimer = null;

  pingTimer = null;

  incomingBuffer = Buffer.alloc(0);

  subscriptions = new Map();

  constructor({
    brokerUrl,
    username = "",
    password = "",
    resolvedAddress = "",
    resolvedFamily = null,
    tlsServername = "",
    keepaliveSeconds = 60,
    connectTimeoutMs = 10000,
    reconnectMinMs = 1000,
    reconnectMaxMs = 30000,
    tlsOptions = {},
  }) {
    super();
    this.brokerUrl = brokerUrl;
    this.username = String(username || "");
    this.password = String(password || "");
    this.resolvedAddress = String(resolvedAddress || "").trim();
    this.resolvedFamily =
      Number(resolvedFamily) === 6 ? 6 : Number(resolvedFamily) === 4 ? 4 : null;
    this.tlsServername = String(tlsServername || "").trim();
    this.keepaliveSeconds = Math.max(
      5,
      Math.min(3600, Math.floor(Number(keepaliveSeconds) || 60))
    );
    this.connectTimeoutMs = Math.max(1000, Math.floor(Number(connectTimeoutMs) || 10000));
    this.reconnectMinMs = Math.max(500, Math.floor(Number(reconnectMinMs) || 1000));
    this.reconnectMaxMs = Math.max(
      this.reconnectMinMs,
      Math.floor(Number(reconnectMaxMs) || 30000)
    );
    this.tlsOptions =
      tlsOptions && typeof tlsOptions === "object" && !Array.isArray(tlsOptions)
        ? tlsOptions
        : {};
  }

  nextPacketId() {
    this.packetId += 1;
    if (this.packetId > 0xffff) {
      this.packetId = 1;
    }
    return this.packetId;
  }

  resetConnectTimer() {
    if (this.connectTimer) {
      clearTimeout(this.connectTimer);
    }
    this.connectTimer = setTimeout(() => {
      this.emit("error", createClientError(504, "MQTT connect timeout"));
      this.socket?.destroy();
    }, this.connectTimeoutMs);
  }

  clearConnectTimer() {
    if (this.connectTimer) {
      clearTimeout(this.connectTimer);
      this.connectTimer = null;
    }
  }

  startPingLoop() {
    this.stopPingLoop();
    const intervalMs = Math.max(1000, Math.floor((this.keepaliveSeconds * 1000) / 2));
    this.pingTimer = setInterval(() => {
      if (!this.connected || !this.socket || this.socket.destroyed) {
        return;
      }
      this.socket.write(buildMqttPingPacket());
    }, intervalMs);
  }

  stopPingLoop() {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  connect() {
    if (this.closed) {
      return;
    }

    const parsed = new URL(this.brokerUrl);
    const isTls = parsed.protocol === "mqtts:";
    const port = Number(parsed.port || (isTls ? 8883 : 1883));
    const host = this.resolvedAddress || parsed.hostname;
    const tlsServername = this.tlsServername || parsed.hostname;

    this.resetConnectTimer();

    this.socket = isTls
      ? tls.connect({
          host,
          port,
          ...(this.resolvedFamily
            ? {
                family: this.resolvedFamily,
              }
            : {}),
          servername: tlsServername,
          rejectUnauthorized: true,
          ...this.tlsOptions,
        })
      : net.connect({
          host,
          port,
          ...(this.resolvedFamily
            ? {
                family: this.resolvedFamily,
              }
            : {}),
        });

    this.socket.on("connect", () => {
      if (!this.socket || this.closed) {
        return;
      }

      const clientId = `freeboard-gw-${crypto.randomBytes(8).toString("hex")}`;
      const packet = buildMqttConnectPacket({
        clientId,
        username: this.username,
        password: this.password,
        keepaliveSeconds: this.keepaliveSeconds,
      });
      this.socket.write(packet);
    });

    this.socket.on("data", (chunk) => {
      this.incomingBuffer = Buffer.concat([this.incomingBuffer, Buffer.from(chunk)]);
      this.processIncomingBuffer();
    });

    this.socket.on("error", (error) => {
      this.emit("error", error);
    });

    this.socket.on("close", () => {
      this.clearConnectTimer();
      this.stopPingLoop();
      this.connected = false;
      this.emit("close");
      if (!this.closed) {
        this.scheduleReconnect();
      }
    });
  }

  scheduleReconnect() {
    if (this.reconnectTimer || this.closed) {
      return;
    }

    this.reconnectAttempt += 1;
    const delay = Math.min(
      this.reconnectMaxMs,
      this.reconnectMinMs * 2 ** (this.reconnectAttempt - 1)
    );
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  sendPacket(packet) {
    if (!this.socket || this.socket.destroyed) {
      throw createClientError(502, "MQTT socket is not connected");
    }
    this.socket.write(packet);
  }

  processIncomingBuffer() {
    while (this.incomingBuffer.length >= 2) {
      const remainingLengthDecoded = decodeMqttRemainingLength(this.incomingBuffer, 1);
      if (!remainingLengthDecoded) {
        return;
      }

      const fixedHeaderLength = 1 + remainingLengthDecoded.bytesUsed;
      const totalLength = fixedHeaderLength + remainingLengthDecoded.value;
      if (this.incomingBuffer.length < totalLength) {
        return;
      }

      const packet = this.incomingBuffer.slice(0, totalLength);
      this.incomingBuffer = this.incomingBuffer.slice(totalLength);

      const firstByte = packet[0];
      const packetType = firstByte >> 4;
      const body = packet.slice(fixedHeaderLength);

      if (packetType === 2) {
        const returnCode = body[1];
        if (returnCode !== 0) {
          this.emit(
            "error",
            createClientError(502, `MQTT broker rejected connection (${returnCode})`)
          );
          this.socket?.destroy();
          return;
        }

        this.clearConnectTimer();
        this.reconnectAttempt = 0;
        this.connected = true;
        this.startPingLoop();
        this.emit("connect");
        this.resubscribeAll();
        continue;
      }

      if (packetType === 3) {
        if (body.length < 2) {
          continue;
        }

        const topicLength = body.readUInt16BE(0);
        let cursor = 2;
        const topic = body.slice(cursor, cursor + topicLength).toString("utf8");
        cursor += topicLength;

        const qos = (firstByte >> 1) & 0x03;
        let packetId = null;
        if (qos > 0 && body.length >= cursor + 2) {
          packetId = body.readUInt16BE(cursor);
          cursor += 2;
        }

        const payload = body.slice(cursor);
        this.emit("message", topic, payload);

        if (qos === 1 && packetId !== null && this.socket && !this.socket.destroyed) {
          this.socket.write(buildMqttPubAckPacket(packetId));
        }
      }
    }
  }

  subscribe(topic, { qos = 0 } = {}, callback = () => {}) {
    const normalizedTopic = String(topic || "").trim();
    if (!normalizedTopic) {
      callback(createClientError(400, "MQTT topic is required"));
      return;
    }

    const normalizedQos = Math.max(0, Math.min(1, Math.floor(Number(qos) || 0)));
    this.subscriptions.set(normalizedTopic, normalizedQos);

    if (!this.connected) {
      callback(null);
      return;
    }

    try {
      this.sendPacket(
        buildMqttSubscribePacket({
          packetId: this.nextPacketId(),
          topic: normalizedTopic,
          qos: normalizedQos,
        })
      );
      callback(null);
    } catch (error) {
      callback(error);
    }
  }

  unsubscribe(topic, callback = () => {}) {
    const normalizedTopic = String(topic || "").trim();
    if (!normalizedTopic) {
      callback(null);
      return;
    }

    this.subscriptions.delete(normalizedTopic);
    if (!this.connected) {
      callback(null);
      return;
    }

    try {
      this.sendPacket(
        buildMqttUnsubscribePacket({
          packetId: this.nextPacketId(),
          topic: normalizedTopic,
        })
      );
      callback(null);
    } catch (error) {
      callback(error);
    }
  }

  resubscribeAll() {
    for (const [topic, qos] of this.subscriptions.entries()) {
      try {
        this.sendPacket(
          buildMqttSubscribePacket({
            packetId: this.nextPacketId(),
            topic,
            qos,
          })
        );
      } catch (error) {
        this.emit("error", error);
      }
    }
  }

  end(force = true) {
    this.closed = true;
    this.clearConnectTimer();
    this.stopPingLoop();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.socket && !this.socket.destroyed) {
      try {
        if (this.connected) {
          this.socket.write(buildMqttDisconnectPacket());
        }
      } catch {
        // ignore disconnect write failures
      }

      if (force) {
        this.socket.destroy();
      } else {
        this.socket.end();
      }
    }
  }
}
