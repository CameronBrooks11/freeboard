/**
 * @module jwt
 * @description Decode a JWT payload on the client (without verification) and read
 * its expiry. Signature verification is the server's job; the UI only reads claims
 * such as `exp` to schedule token refreshes. base64url decoding uses the global
 * `atob`, which is available in all supported browsers and Node (>= the engine floor).
 */

const decodeBase64 = (value: string): string =>
  typeof globalThis.atob === "function" ? globalThis.atob(value) : "";

export const parseJwtPayload = (token: unknown): Record<string, unknown> | null => {
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

export const getTokenExpiryMs = (token: unknown): number | null => {
  const exp = Number(parseJwtPayload(token)?.exp);
  return Number.isFinite(exp) ? exp * 1000 : null;
};
