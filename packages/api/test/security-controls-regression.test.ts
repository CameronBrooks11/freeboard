import assert from "node:assert/strict";
import type { IncomingMessage } from "node:http";
import { afterEach, test } from "node:test";
import bcrypt from "bcryptjs";

import { deriveClientIp } from "../src/clientIp.js";
import { config } from "../src/config.js";
import { resetLoginThrottleState } from "../src/loginThrottle.js";
import Dashboard from "../src/models/Dashboard.js";
import User from "../src/models/User.js";
import { resetRateLimitState } from "../src/rateLimit.js";
import DatasourceResolvers from "../src/resolvers/Datasource.js";
import UserResolvers from "../src/resolvers/User.js";
import { getApiRuntimeMetricsSnapshot } from "../src/runtimeMetrics.js";

const originalDashboardFindOne = Dashboard.findOne;
const originalUserFindOne = User.findOne;
const originalUserFindOneAndUpdate = User.findOneAndUpdate;

const asLean = (value: unknown) => ({
  lean: async () => value,
});

const createRequest = ({
  forwardedFor,
  socketRemoteAddress = "::ffff:127.0.0.1",
}: {
  forwardedFor: string;
  socketRemoteAddress?: string;
}): IncomingMessage & { ip?: string | null } =>
  ({
    headers: {
      "x-forwarded-for": forwardedFor,
    },
    socket: {
      remoteAddress: socketRemoteAddress,
    },
  }) as IncomingMessage & { ip?: string | null };

const deriveTrustedIpFromForwardedChain = (forwardedFor: string): string =>
  deriveClientIp(createRequest({ forwardedFor }), {
    trustProxyHops: 1,
  });

afterEach(() => {
  Dashboard.findOne = originalDashboardFindOne;
  User.findOne = originalUserFindOne;
  User.findOneAndUpdate = originalUserFindOneAndUpdate;
  resetLoginThrottleState();
  resetRateLimitState();
});

test("authUser throttle enforces trusted IP identity and blocks spoofed-prefix bypass attempts", async () => {
  const beforeMetrics = getApiRuntimeMetricsSnapshot();
  const passwordHash = bcrypt.hashSync("StrongPass123!", 8);
  const maxAttempts = Math.max(1, Number(config.authLoginMaxAttempts) || 1);

  User.findOne = ({ email }: { email?: string }) => {
    const normalizedEmail = String(email || "")
      .trim()
      .toLowerCase();
    return asLean(
      normalizedEmail === "user@example.com"
        ? {
            _id: "user-1",
            email: "user@example.com",
            role: "viewer",
            active: true,
            sessionVersion: 0,
            password: passwordHash,
          }
        : null,
    );
  };
  User.findOneAndUpdate = () => asLean(null);

  const trustedIpFromRequestA = deriveTrustedIpFromForwardedChain("198.51.100.10, 203.0.113.44");
  const trustedIpFromRequestB = deriveTrustedIpFromForwardedChain("198.51.100.11, 203.0.113.44");

  assert.equal(trustedIpFromRequestA, "203.0.113.44");
  assert.equal(trustedIpFromRequestB, "203.0.113.44");

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    await assert.rejects(
      () =>
        UserResolvers.Mutation.authUser(
          null,
          {
            email: "user@example.com",
            password: "wrong-password",
          },
          {
            clientIp: trustedIpFromRequestA,
          },
        ),
      /Invalid credentials/,
    );
  }

  await assert.rejects(
    () =>
      UserResolvers.Mutation.authUser(
        null,
        {
          email: "user@example.com",
          password: "wrong-password",
        },
        {
          clientIp: trustedIpFromRequestB,
        },
      ),
    /Too many login attempts/i,
  );

  const afterMetrics = getApiRuntimeMetricsSnapshot();
  assert.equal(
    afterMetrics.limiterAllowedCount - beforeMetrics.limiterAllowedCount >=
      Math.max(1, maxAttempts - 1),
    true,
  );
  assert.equal(afterMetrics.limiterRejectedCount - beforeMetrics.limiterRejectedCount >= 1, true);
});

test("public datasource mint limiter keys by trusted IP and rejects spoofed forwarded-prefix bypass", async () => {
  const beforeMetrics = getApiRuntimeMetricsSnapshot();
  const publicIpLimit = Math.max(1, Number(config.datasourceTokenMintRateLimitPublicIpPerMin) || 1);

  Dashboard.findOne = ({ _id }: { _id?: string }) =>
    asLean(
      _id === "dash-public-rate-limit"
        ? {
            _id: "dash-public-rate-limit",
            user: "owner-1",
            visibility: "public",
            shareToken: "public-share-token",
            shareTokenVersion: 1,
            acl: [],
            datasources: [
              {
                id: "ds-public-1",
                type: "http",
                settings: {
                  url: "https://example.com/api/status",
                  method: "GET",
                  parser: "json",
                },
              },
            ],
          }
        : null,
    );

  const trustedIpFromRequestA = deriveTrustedIpFromForwardedChain("198.51.100.20, 203.0.113.70");
  const trustedIpFromRequestB = deriveTrustedIpFromForwardedChain("198.51.100.21, 203.0.113.70");

  assert.equal(trustedIpFromRequestA, "203.0.113.70");
  assert.equal(trustedIpFromRequestB, "203.0.113.70");

  for (let attempt = 0; attempt < publicIpLimit; attempt += 1) {
    const result = await DatasourceResolvers.Mutation.mintDatasourceSessionToken(
      null,
      {
        dashboardId: "dash-public-rate-limit",
        datasourceId: "ds-public-1",
        shareToken: null,
      },
      {
        clientIp: trustedIpFromRequestA,
      },
    );

    assert.ok(result?.token);
  }

  await assert.rejects(
    () =>
      DatasourceResolvers.Mutation.mintDatasourceSessionToken(
        null,
        {
          dashboardId: "dash-public-rate-limit",
          datasourceId: "ds-public-1",
          shareToken: null,
        },
        {
          clientIp: trustedIpFromRequestB,
        },
      ),
    /Too many datasource session token requests/i,
  );

  const afterMetrics = getApiRuntimeMetricsSnapshot();
  assert.equal(
    afterMetrics.limiterAllowedCount - beforeMetrics.limiterAllowedCount >= publicIpLimit,
    true,
  );
  assert.equal(afterMetrics.limiterRejectedCount - beforeMetrics.limiterRejectedCount >= 1, true);
});
