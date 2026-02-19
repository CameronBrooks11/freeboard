/**
 * @module gateway/networkPolicy
 * @description Egress URL parsing and destination-allow policy.
 */

import dns from "dns";
import net from "net";
import { URL } from "url";
import {
  ALLOWED_HOST_PATTERNS,
  ALLOWED_PORTS,
  ALLOW_PRIVATE_DESTINATIONS,
  IS_PRODUCTION,
} from "./runtimeConfig.js";
import { createClientError } from "./errors.js";

const blockedIpv4Ranges = [
  { start: "0.0.0.0", end: "0.255.255.255" },
  { start: "10.0.0.0", end: "10.255.255.255" },
  { start: "100.64.0.0", end: "100.127.255.255" },
  { start: "127.0.0.0", end: "127.255.255.255" },
  { start: "169.254.0.0", end: "169.254.255.255" },
  { start: "172.16.0.0", end: "172.31.255.255" },
  { start: "192.0.0.0", end: "192.0.0.255" },
  { start: "192.0.2.0", end: "192.0.2.255" },
  { start: "192.168.0.0", end: "192.168.255.255" },
  { start: "198.18.0.0", end: "198.19.255.255" },
  { start: "198.51.100.0", end: "198.51.100.255" },
  { start: "203.0.113.0", end: "203.0.113.255" },
  { start: "224.0.0.0", end: "239.255.255.255" },
  { start: "240.0.0.0", end: "255.255.255.255" },
];

type HostLookup = (hostname: string, options: dns.LookupAllOptions) => Promise<dns.LookupAddress[]>;

export type ResolvedDestination = {
  address: string;
  family: 4 | 6;
};

type OutboundParseParams = {
  rawTarget: string;
  allowedProtocols: Set<string>;
  defaultPortByProtocol: Record<string, number>;
  protocolErrorMessage: string;
};

const ipToNumber = (ip: string): number =>
  ip
    .split(".")
    .map((part) => Number(part))
    .reduce((acc, octet) => (acc << 8) + octet, 0) >>> 0;

const isBlockedIpv4 = (ip: string): boolean => {
  const ipNumber = ipToNumber(ip);
  return blockedIpv4Ranges.some(({ start, end }) => {
    const startNumber = ipToNumber(start);
    const endNumber = ipToNumber(end);
    return ipNumber >= startNumber && ipNumber <= endNumber;
  });
};

const isBlockedIpv6 = (ip: string): boolean => {
  const normalized = ip.toLowerCase();
  if (normalized === "::1" || normalized === "::") {
    return true;
  }
  if (normalized.startsWith("fc") || normalized.startsWith("fd")) {
    return true;
  }
  if (normalized.startsWith("fe8") || normalized.startsWith("fe9")) {
    return true;
  }
  if (normalized.startsWith("fea") || normalized.startsWith("feb")) {
    return true;
  }
  if (normalized.startsWith("ff")) {
    return true;
  }
  if (normalized.startsWith("::ffff:")) {
    const mappedIpv4 = normalized.slice(7);
    if (net.isIP(mappedIpv4) === 4) {
      return isBlockedIpv4(mappedIpv4);
    }
  }
  return false;
};

const isBlockedIpAddress = (address: string): boolean => {
  const family = net.isIP(address);
  if (family === 4) {
    return isBlockedIpv4(address);
  }
  if (family === 6) {
    return isBlockedIpv6(address);
  }
  return true;
};

const isBlockedHostname = (hostname: string): boolean => {
  const normalized = hostname.toLowerCase();
  if (
    normalized === "localhost" ||
    normalized.endsWith(".localhost") ||
    normalized.endsWith(".local") ||
    normalized.endsWith(".internal")
  ) {
    return true;
  }
  return !normalized.includes(".");
};

const hostMatchesPattern = (hostname: string, pattern: string): boolean => {
  if (pattern === "*") {
    return !IS_PRODUCTION;
  }
  if (pattern.startsWith("*.")) {
    const suffix = pattern.slice(2);
    return hostname === suffix || hostname.endsWith(`.${suffix}`);
  }
  return hostname === pattern;
};

const isAllowedHost = (hostname: string): boolean => {
  if (ALLOWED_HOST_PATTERNS.length === 0) {
    return !IS_PRODUCTION;
  }
  return ALLOWED_HOST_PATTERNS.some((pattern) => hostMatchesPattern(hostname, pattern));
};

const hasAllowedPort = (port: number): boolean => ALLOWED_PORTS.includes(port);

export const parseOutboundUrl = ({
  rawTarget,
  allowedProtocols,
  defaultPortByProtocol,
  protocolErrorMessage,
}: OutboundParseParams): { target: URL; port: number; hostname: string } => {
  if (!rawTarget || typeof rawTarget !== "string") {
    throw createClientError(400, "Target URL is required");
  }

  let target;
  try {
    target = new URL(rawTarget);
  } catch {
    throw createClientError(400, "Invalid target URL");
  }

  if (!allowedProtocols.has(target.protocol)) {
    throw createClientError(400, protocolErrorMessage);
  }

  if (target.username || target.password) {
    throw createClientError(400, "Credentials in URL are not allowed");
  }

  const defaultPort = defaultPortByProtocol[target.protocol];
  const port = Number(target.port || defaultPort || 0);
  if (!hasAllowedPort(port)) {
    throw createClientError(403, "Target port is not allowed");
  }

  const hostname = target.hostname.toLowerCase();
  if (!isAllowedHost(hostname)) {
    throw createClientError(403, "Target host is not allowed");
  }

  if (!ALLOW_PRIVATE_DESTINATIONS && isBlockedHostname(hostname)) {
    throw createClientError(403, "Target host is blocked");
  }

  return { target, port, hostname };
};

export const parseTargetUrl = (rawTarget: string) =>
  parseOutboundUrl({
    rawTarget,
    allowedProtocols: new Set(["http:", "https:"]),
    defaultPortByProtocol: {
      "http:": 80,
      "https:": 443,
    },
    protocolErrorMessage: "Only http and https protocols are allowed",
  });

export const ensureResolvedDestinationIsAllowed = async (
  hostname: string,
  { lookup = dns.promises.lookup as HostLookup }: { lookup?: HostLookup } = {},
): Promise<ResolvedDestination> => {
  const resolved = await lookup(hostname, { all: true, verbatim: true });
  if (!Array.isArray(resolved) || resolved.length === 0) {
    throw createClientError(502, "Unable to resolve target host");
  }

  if (!ALLOW_PRIVATE_DESTINATIONS) {
    for (const record of resolved) {
      if (isBlockedIpAddress(record.address)) {
        throw createClientError(403, "Target resolves to a blocked address");
      }
    }
  }

  const primaryRecord = resolved[0];
  const family: 4 | 6 = Number(primaryRecord.family) === 6 ? 6 : 4;
  return {
    address: primaryRecord.address,
    family,
  };
};
