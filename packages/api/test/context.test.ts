import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import { createAuthToken } from "../src/auth.js";
import { setContext } from "../src/context.js";
import { config } from "../src/config.js";
import { dataStore } from "../src/data/index.js";
import crypto from "node:crypto";
import jwt from "jsonwebtoken";

const userRepository = dataStore.repositories.users;
const serviceAccountRepository = dataStore.repositories.serviceAccounts;
const serviceAccountTokenRepository = dataStore.repositories.serviceAccountTokens;
const originalUserFindActiveById = userRepository.findActiveById;
const originalServiceAccountFindActiveById = serviceAccountRepository.findActiveById;
const originalServiceAccountTouchLastUsed = serviceAccountRepository.touchLastUsed;
const originalServiceAccountTokenFindById = serviceAccountTokenRepository.findById;
const originalServiceAccountTokenTouchLastUsed = serviceAccountTokenRepository.touchLastUsed;

afterEach(() => {
  userRepository.findActiveById = originalUserFindActiveById;
  serviceAccountRepository.findActiveById = originalServiceAccountFindActiveById;
  serviceAccountRepository.touchLastUsed = originalServiceAccountTouchLastUsed;
  serviceAccountTokenRepository.findById = originalServiceAccountTokenFindById;
  serviceAccountTokenRepository.touchLastUsed = originalServiceAccountTokenTouchLastUsed;
});

test("setContext hydrates authenticated user when sessionVersion matches", async () => {
  const token = createAuthToken("viewer@example.com", "viewer", true, "user-1", 2);

  userRepository.findActiveById = async ({ userId }) =>
    userId === "user-1"
      ? {
          _id: "user-1",
          email: "viewer@example.com",
          role: "viewer",
          active: true,
          sessionVersion: 2,
          password: "ignored",
          registrationDate: new Date("2026-01-01T00:00:00.000Z"),
          lastLogin: new Date("2026-01-01T00:00:00.000Z"),
          createdAt: new Date("2026-01-01T00:00:00.000Z"),
          updatedAt: new Date("2026-01-01T00:00:00.000Z"),
        }
      : null;

  const context = await setContext({
    req: {
      headers: { authorization: `Bearer ${token}` },
      socket: { remoteAddress: "127.0.0.1" },
    },
  });

  assert.ok(context.user);
  assert.equal(context.user._id, "user-1");
  assert.equal(context.user.sessionVersion, 2);
  assert.equal(context.authenticationError, undefined);
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

  userRepository.findActiveById = async ({ userId }) =>
    userId === "user-1"
      ? {
          _id: "user-1",
          email: "viewer@example.com",
          role: "viewer",
          active: true,
          sessionVersion: 3,
          password: "ignored",
          registrationDate: new Date("2026-01-01T00:00:00.000Z"),
          lastLogin: new Date("2026-01-01T00:00:00.000Z"),
          createdAt: new Date("2026-01-01T00:00:00.000Z"),
          updatedAt: new Date("2026-01-01T00:00:00.000Z"),
        }
      : null;

  const context = await setContext({
    req: {
      headers: { authorization: `Bearer ${token}` },
      socket: { remoteAddress: "127.0.0.1" },
    },
  });

  assert.equal(context.user, undefined);
  assert.equal(context.authenticationError?.extensions?.code, "UNAUTHENTICATED");
});

const persistedViewer = {
  _id: "user-1",
  email: "viewer@example.com",
  role: "viewer",
  active: true,
  sessionVersion: 0,
  password: "ignored",
  registrationDate: new Date("2026-01-01T00:00:00.000Z"),
  lastLogin: new Date("2026-01-01T00:00:00.000Z"),
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
};

const contextFor = (authorization: string) =>
  setContext({
    req: {
      headers: { authorization },
      socket: { remoteAddress: "127.0.0.1" },
    },
  });

test("setContext marks an expired JWT as failed authentication instead of anonymous", async () => {
  userRepository.findActiveById = async () => persistedViewer;
  const nowSeconds = Math.floor(Date.now() / 1000);
  const expired = jwt.sign(
    { _id: "user-1", email: "viewer@example.com", role: "viewer", sv: 0, iat: nowSeconds - 7200 },
    config.jwtSecret,
    { expiresIn: 60 },
  );

  const context = await contextFor(`Bearer ${expired}`);

  assert.equal(context.user, undefined);
  assert.equal(context.authenticationError?.extensions?.code, "UNAUTHENTICATED");
});

test("setContext marks a malformed token as failed authentication", async () => {
  const context = await contextFor("Bearer not-a-jwt");

  assert.equal(context.user, undefined);
  assert.equal(context.authenticationError?.extensions?.code, "UNAUTHENTICATED");
});

test("setContext marks a token for a missing or inactive user as failed authentication", async () => {
  userRepository.findActiveById = async () => null;
  const token = createAuthToken("viewer@example.com", "viewer", true, "user-1", 0);

  const context = await contextFor(`Bearer ${token}`);

  assert.equal(context.user, undefined);
  assert.equal(context.authenticationError?.extensions?.code, "UNAUTHENTICATED");
});

test("setContext marks an unknown service account token as failed authentication", async () => {
  serviceAccountTokenRepository.findById = async () => null;

  const context = await contextFor("Bearer fsa_missing.secret");

  assert.equal(context.serviceAccount, undefined);
  assert.equal(context.authenticationError?.extensions?.code, "UNAUTHENTICATED");
});

test("setContext without an Authorization header stays anonymous with no error", async () => {
  const context = await setContext({
    req: { headers: {}, socket: { remoteAddress: "127.0.0.1" } },
  });

  assert.equal(context.user, undefined);
  assert.equal(context.authenticationError, undefined);
});

test("setContext keeps a valid token's request anonymous, not rejected, when the user lookup fails", async () => {
  userRepository.findActiveById = async () => {
    throw new Error("connect ECONNREFUSED");
  };
  const token = createAuthToken("viewer@example.com", "viewer", true, "user-1", 0);

  const context = await contextFor(`Bearer ${token}`);

  assert.equal(context.user, undefined);
  assert.equal(context.authenticationError, undefined);
});

test("setContext hydrates authenticated service account principal from fsa token", async () => {
  const tokenId = "token-1";
  const secret = "service-secret";
  const tokenHash = crypto
    .createHash("sha256")
    .update(`${secret}:${config.jwtSecret}`)
    .digest("hex");

  serviceAccountTokenRepository.findById = async ({ tokenId: lookupTokenId }) =>
    lookupTokenId === tokenId
      ? {
          _id: tokenId,
          serviceAccountId: "svc-1",
          label: null,
          scopes: ["ops:read"],
          tokenHash,
          tokenPrefix: "service-",
          expiresAt: null,
          revokedAt: null,
          createdByUserId: null,
          lastUsedAt: null,
          createdAt: new Date("2026-01-01T00:00:00.000Z"),
          updatedAt: new Date("2026-01-01T00:00:00.000Z"),
        }
      : null;
  serviceAccountRepository.findActiveById = async ({ accountId }) =>
    accountId === "svc-1"
      ? {
          _id: "svc-1",
          name: "ops-bot",
          description: "",
          active: true,
          scopes: ["ops:read"],
          createdByUserId: null,
          lastUsedAt: null,
          createdAt: new Date("2026-01-01T00:00:00.000Z"),
          updatedAt: new Date("2026-01-01T00:00:00.000Z"),
        }
      : null;
  serviceAccountTokenRepository.touchLastUsed = async () => {};
  serviceAccountRepository.touchLastUsed = async () => {};

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
