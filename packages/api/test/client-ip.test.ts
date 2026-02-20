import assert from "node:assert/strict";
import type { IncomingMessage } from "http";
import test from "node:test";

import { deriveClientIp } from "../src/clientIp.js";

const createRequest = ({
  forwardedFor,
  socketRemoteAddress = "::ffff:127.0.0.1",
  requestIp = null,
}: {
  forwardedFor?: string | string[];
  socketRemoteAddress?: string;
  requestIp?: string | null;
} = {}): IncomingMessage & { ip?: string | null } =>
  ({
    headers: forwardedFor ? { "x-forwarded-for": forwardedFor } : {},
    socket: {
      remoteAddress: socketRemoteAddress,
    },
    ip: requestIp,
  }) as IncomingMessage & { ip?: string | null };

test("deriveClientIp ignores X-Forwarded-For when trustProxyHops=0", () => {
  const ip = deriveClientIp(
    createRequest({
      forwardedFor: "198.51.100.10, 192.0.2.10",
      socketRemoteAddress: "::ffff:10.1.2.3",
    }),
    { trustProxyHops: 0 },
  );
  assert.equal(ip, "10.1.2.3");
});

test("deriveClientIp uses right-to-left proxy-hop selection", () => {
  const ip = deriveClientIp(
    createRequest({
      forwardedFor: "198.51.100.10, 203.0.113.20",
      socketRemoteAddress: "::ffff:192.0.2.30",
    }),
    { trustProxyHops: 1 },
  );
  assert.equal(ip, "203.0.113.20");
});

test("deriveClientIp falls back and warns when trusted-hop header chain is missing", () => {
  const warnings: string[] = [];
  const ip = deriveClientIp(createRequest(), {
    trustProxyHops: 1,
    onWarning: (message) => warnings.push(message),
    warningPrefix: "api-test: ",
  });

  assert.equal(ip, "127.0.0.1");
  assert.equal(warnings.length, 1);
  assert.match(warnings[0] || "", /^api-test:/);
});

test("deriveClientIp falls back to req.ip when socket address is unavailable", () => {
  const ip = deriveClientIp(
    createRequest({
      socketRemoteAddress: "",
      requestIp: "::ffff:172.16.0.20",
    }),
    { trustProxyHops: 0 },
  );
  assert.equal(ip, "172.16.0.20");
});

test("deriveClientIp rejects invalid forwarded entries and falls back", () => {
  const warnings: string[] = [];
  const ip = deriveClientIp(
    createRequest({
      forwardedFor: "garbage, not-an-ip",
      socketRemoteAddress: "::ffff:10.10.10.10",
    }),
    {
      trustProxyHops: 1,
      onWarning: (message) => warnings.push(message),
    },
  );

  assert.equal(ip, "10.10.10.10");
  assert.equal(warnings.length, 1);
});

test("deriveClientIp falls back when forwarded chain is shorter than trust hops", () => {
  const warnings: string[] = [];
  const ip = deriveClientIp(
    createRequest({
      forwardedFor: "198.51.100.10",
      socketRemoteAddress: "::ffff:203.0.113.5",
    }),
    {
      trustProxyHops: 2,
      onWarning: (message) => warnings.push(message),
    },
  );

  assert.equal(ip, "203.0.113.5");
  assert.equal(warnings.length, 1);
});
