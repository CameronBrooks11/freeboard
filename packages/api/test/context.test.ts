import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import { createAuthToken } from "../src/auth.js";
import { setContext } from "../src/context.js";
import ServiceAccount from "../src/models/ServiceAccount.js";
import ServiceAccountToken from "../src/models/ServiceAccountToken.js";
import User from "../src/models/User.js";
import { config } from "../src/config.js";
import crypto from "node:crypto";

const asLean = (value) => ({
  lean: async () => value,
});

const originalFindOne = User.findOne;
const originalServiceAccountFindOne = ServiceAccount.findOne;
const originalServiceAccountUpdateOne = ServiceAccount.updateOne;
const originalServiceAccountTokenFindOne = ServiceAccountToken.findOne;
const originalServiceAccountTokenUpdateOne = ServiceAccountToken.updateOne;

afterEach(() => {
  User.findOne = originalFindOne;
  ServiceAccount.findOne = originalServiceAccountFindOne;
  ServiceAccount.updateOne = originalServiceAccountUpdateOne;
  ServiceAccountToken.findOne = originalServiceAccountTokenFindOne;
  ServiceAccountToken.updateOne = originalServiceAccountTokenUpdateOne;
});

test("setContext hydrates authenticated user when sessionVersion matches", async () => {
  const token = createAuthToken("viewer@example.com", "viewer", true, "user-1", 2);

  User.findOne = ({ _id, active }) =>
    asLean(
      _id === "user-1" && active === true
        ? {
            _id: "user-1",
            email: "viewer@example.com",
            role: "viewer",
            active: true,
            sessionVersion: 2,
          }
        : null,
    );

  const context = await setContext({
    req: {
      headers: { authorization: `Bearer ${token}` },
      socket: { remoteAddress: "127.0.0.1" },
    },
  });

  assert.ok(context.user);
  assert.equal(context.user._id, "user-1");
  assert.equal(context.user.sessionVersion, 2);
});

test("setContext derives clientIp from socket address when trust hops are disabled", async () => {
  const context = await setContext({
    req: {
      headers: {
        "x-forwarded-for": "198.51.100.10, 203.0.113.20",
      },
      socket: { remoteAddress: "::ffff:127.0.0.1" },
    },
  });

  assert.equal(context.clientIp, "127.0.0.1");
});

test("setContext rejects stale JWT when sessionVersion no longer matches", async () => {
  const token = createAuthToken("viewer@example.com", "viewer", true, "user-1", 0);

  User.findOne = ({ _id, active }) =>
    asLean(
      _id === "user-1" && active === true
        ? {
            _id: "user-1",
            email: "viewer@example.com",
            role: "viewer",
            active: true,
            sessionVersion: 3,
          }
        : null,
    );

  const context = await setContext({
    req: {
      headers: { authorization: `Bearer ${token}` },
      socket: { remoteAddress: "127.0.0.1" },
    },
  });

  assert.equal(context.user, undefined);
});

test("setContext hydrates authenticated service account principal from fsa token", async () => {
  const tokenId = "token-1";
  const secret = "service-secret";
  const tokenHash = crypto
    .createHash("sha256")
    .update(`${secret}:${config.jwtSecret}`)
    .digest("hex");

  ServiceAccountToken.findOne = ({ _id }) =>
    asLean(
      _id === tokenId
        ? {
            _id: tokenId,
            serviceAccountId: "svc-1",
            tokenHash,
            scopes: ["ops:read"],
            revokedAt: null,
            expiresAt: null,
          }
        : null,
    );
  ServiceAccount.findOne = ({ _id, active }) =>
    asLean(
      _id === "svc-1" && active === true
        ? {
            _id: "svc-1",
            name: "ops-bot",
            active: true,
            scopes: ["ops:read"],
          }
        : null,
    );
  ServiceAccountToken.updateOne = async () => {};
  ServiceAccount.updateOne = async () => {};

  const context = await setContext({
    req: {
      headers: { authorization: `Bearer fsa_${tokenId}.${secret}` },
      socket: { remoteAddress: "127.0.0.1" },
    },
  });

  assert.equal(context.user, undefined);
  assert.ok(context.serviceAccount);
  assert.equal(context.serviceAccount._id, "svc-1");
  assert.deepEqual(context.serviceAccount.scopes, ["ops:read"]);
});
