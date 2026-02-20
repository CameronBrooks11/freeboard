/**
 * @module shared/clientIp
 * Canonical trusted client IP derivation used by API and gateway.
 */

import net from "node:net";
import type { IncomingMessage } from "node:http";

type RequestWithIp = IncomingMessage & { ip?: string | null };

export type DeriveClientIpOptions = {
  trustProxyHops?: number;
  warningPrefix?: string;
  onWarning?: (message: string) => void;
};

const MAX_TRUST_PROXY_HOPS = 16;

const clampTrustProxyHops = (value: unknown): number => {
  const normalized = Number(value);
  if (!Number.isFinite(normalized)) {
    return 0;
  }
  return Math.max(0, Math.min(MAX_TRUST_PROXY_HOPS, Math.floor(normalized)));
};

const stripWrappingQuotes = (value: string): string =>
  value.startsWith('"') && value.endsWith('"') && value.length >= 2 ? value.slice(1, -1) : value;

const stripWrappingBrackets = (value: string): string =>
  value.startsWith("[") && value.endsWith("]") && value.length >= 2 ? value.slice(1, -1) : value;

const stripIpv4PortSuffix = (value: string): string => {
  const match = value.match(/^(\d{1,3}(?:\.\d{1,3}){3}):\d+$/);
  return match?.[1] || value;
};

const stripIpv6ZoneId = (value: string): string => {
  const zoneIndex = value.indexOf("%");
  if (zoneIndex <= 0) {
    return value;
  }
  return value.slice(0, zoneIndex);
};

const normalizeMappedIpv4 = (value: string): string => {
  const lowered = value.toLowerCase();
  return lowered.startsWith("::ffff:") ? value.slice(7) : value;
};

const normalizeIp = (value: unknown): string | null => {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const normalized = normalizeMappedIpv4(
    stripIpv6ZoneId(stripIpv4PortSuffix(stripWrappingBrackets(stripWrappingQuotes(trimmed)))),
  );
  return net.isIP(normalized) ? normalized : null;
};

const parseForwardedForEntries = (headerValue: unknown): Array<string | null> => {
  const raw = Array.isArray(headerValue)
    ? headerValue.filter((entry): entry is string => typeof entry === "string").join(",")
    : typeof headerValue === "string"
      ? headerValue
      : "";

  if (!raw.trim()) {
    return [];
  }

  return raw.split(",").map((entry) => normalizeIp(entry));
};

/**
 * Derive effective client IP from socket and trusted proxy chain settings.
 *
 * - `trustProxyHops=0`: always uses socket/request IP fallback.
 * - `trustProxyHops>0`: uses right-to-left `X-Forwarded-For` selection.
 */
export const deriveClientIp = (
  request: RequestWithIp,
  { trustProxyHops = 0, warningPrefix = "", onWarning = console.warn }: DeriveClientIpOptions = {},
): string => {
  const safeTrustProxyHops = clampTrustProxyHops(trustProxyHops);
  const warningHandler = typeof onWarning === "function" ? onWarning : console.warn;
  const socketIp = normalizeIp(request?.socket?.remoteAddress);
  const requestIp = normalizeIp(request?.ip);
  const fallbackIp = socketIp || requestIp || "unknown-ip";

  if (safeTrustProxyHops <= 0) {
    return fallbackIp;
  }

  const warn = (message: string): void => {
    warningHandler(`${warningPrefix}${message}`);
  };

  const forwardedEntries = parseForwardedForEntries(request?.headers?.["x-forwarded-for"]);
  if (forwardedEntries.length === 0) {
    warn(
      "trust proxy hops configured but X-Forwarded-For is missing/invalid; falling back to socket address.",
    );
    return fallbackIp;
  }

  if (forwardedEntries.length < safeTrustProxyHops) {
    warn(
      "X-Forwarded-For has fewer entries than configured trust proxy hops; falling back to socket address.",
    );
    return fallbackIp;
  }

  const selectedIndex = forwardedEntries.length - safeTrustProxyHops;
  const selected = forwardedEntries[selectedIndex];
  if (!selected) {
    warn(
      "Unable to derive trusted client IP from X-Forwarded-For; falling back to socket address.",
    );
    return fallbackIp;
  }

  const trustedProxyEntries = forwardedEntries.slice(selectedIndex + 1);
  if (trustedProxyEntries.some((entry) => !entry)) {
    warn(
      "Trusted proxy chain contains invalid X-Forwarded-For entries; falling back to socket address.",
    );
    return fallbackIp;
  }

  return selected;
};
