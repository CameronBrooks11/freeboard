/**
 * @module realtime/mqttCodec
 * @description MQTT topic matching and packet codec helpers used by gateway realtime transport.
 */

export const matchesMqttTopicPattern = (topic: string, pattern: string): boolean => {
  const topicLevels = String(topic || "").split("/");
  const patternLevels = String(pattern || "").split("/");

  for (let index = 0; index < patternLevels.length; index += 1) {
    const patternLevel = patternLevels[index];
    const topicLevel = topicLevels[index];

    if (patternLevel === "#") {
      return index === patternLevels.length - 1;
    }

    if (topicLevel === undefined) {
      return false;
    }

    if (patternLevel === "+") {
      continue;
    }

    if (patternLevel !== topicLevel) {
      return false;
    }
  }

  return topicLevels.length === patternLevels.length;
};

export const isMqttTopicAllowed = (topic: string, allowlist: string[]): boolean =>
  Array.isArray(allowlist) && allowlist.some((pattern) => matchesMqttTopicPattern(topic, pattern));

export const normalizeMqttAllowlist = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((entry) => String(entry || "").trim()).filter(Boolean);
};

const encodeMqttString = (value: unknown): Buffer => {
  const encoded = Buffer.from(String(value || ""), "utf8");
  const header = Buffer.alloc(2);
  header.writeUInt16BE(encoded.length, 0);
  return Buffer.concat([header, encoded]);
};

const encodeMqttRemainingLength = (value: number): Buffer => {
  const bytes: number[] = [];
  let remaining = value;
  do {
    let digit = remaining % 128;
    remaining = Math.floor(remaining / 128);
    if (remaining > 0) {
      digit |= 0x80;
    }
    bytes.push(digit);
  } while (remaining > 0);
  return Buffer.from(bytes);
};

export const decodeMqttRemainingLength = (
  buffer: Buffer,
  offset = 1,
): { value: number; bytesUsed: number } | null => {
  let multiplier = 1;
  let value = 0;
  let consumed = 0;

  while (true) {
    const byte = buffer[offset + consumed];
    if (byte === undefined) {
      return null;
    }

    value += (byte & 0x7f) * multiplier;
    consumed += 1;
    if ((byte & 0x80) === 0) {
      break;
    }
    multiplier *= 128;
    if (consumed > 4) {
      return null;
    }
  }

  return {
    value,
    bytesUsed: consumed,
  };
};

export const buildMqttConnectPacket = ({
  clientId,
  username,
  password,
  keepaliveSeconds,
}: {
  clientId: string;
  username?: string;
  password?: string;
  keepaliveSeconds?: number;
}): Buffer => {
  const protocolName = encodeMqttString("MQTT");
  const protocolLevel = Buffer.from([0x04]);
  let connectFlags = 0x02;

  const usernameValue = String(username || "");
  const passwordValue = String(password || "");
  if (usernameValue) {
    connectFlags |= 0x80;
  }
  if (passwordValue) {
    connectFlags |= 0x40;
  }

  const connectFlagsBuffer = Buffer.from([connectFlags]);
  const keepaliveBuffer = Buffer.alloc(2);
  keepaliveBuffer.writeUInt16BE(
    Math.max(5, Math.min(3600, Math.floor(Number(keepaliveSeconds) || 60))),
    0,
  );

  const payloadParts = [encodeMqttString(clientId)];
  if (usernameValue) {
    payloadParts.push(encodeMqttString(usernameValue));
  }
  if (passwordValue) {
    payloadParts.push(encodeMqttString(passwordValue));
  }

  const variableHeader = Buffer.concat([
    protocolName,
    protocolLevel,
    connectFlagsBuffer,
    keepaliveBuffer,
  ]);
  const payload = Buffer.concat(payloadParts);
  const remainingLength = encodeMqttRemainingLength(variableHeader.length + payload.length);

  return Buffer.concat([Buffer.from([0x10]), remainingLength, variableHeader, payload]);
};

export const buildMqttSubscribePacket = ({
  packetId,
  topic,
  qos,
}: {
  packetId: number;
  topic: string;
  qos?: number;
}): Buffer => {
  const variableHeader = Buffer.alloc(2);
  variableHeader.writeUInt16BE(packetId, 0);
  const payload = Buffer.concat([
    encodeMqttString(topic),
    Buffer.from([Math.max(0, Math.min(1, Math.floor(Number(qos) || 0)))]),
  ]);
  const remainingLength = encodeMqttRemainingLength(variableHeader.length + payload.length);
  return Buffer.concat([Buffer.from([0x82]), remainingLength, variableHeader, payload]);
};

export const buildMqttUnsubscribePacket = ({
  packetId,
  topic,
}: {
  packetId: number;
  topic: string;
}): Buffer => {
  const variableHeader = Buffer.alloc(2);
  variableHeader.writeUInt16BE(packetId, 0);
  const payload = encodeMqttString(topic);
  const remainingLength = encodeMqttRemainingLength(variableHeader.length + payload.length);
  return Buffer.concat([Buffer.from([0xa2]), remainingLength, variableHeader, payload]);
};

export const buildMqttPingPacket = () => Buffer.from([0xc0, 0x00]);
export const buildMqttDisconnectPacket = () => Buffer.from([0xe0, 0x00]);

export const buildMqttPubAckPacket = (packetId: number): Buffer => {
  const packet = Buffer.alloc(4);
  packet[0] = 0x40;
  packet[1] = 0x02;
  packet.writeUInt16BE(packetId, 2);
  return packet;
};
