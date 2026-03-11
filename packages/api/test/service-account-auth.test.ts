import assert from "node:assert/strict";
import crypto from "node:crypto";
import { afterEach, test } from "node:test";

import { config } from "../src/config.js";
import { dataStore } from "../src/data/index.js";
import {
  authenticateServiceAccountToken,
  normalizeServiceAccountScopes,
} from "../src/serviceAccountAuth.js";

const serviceAccountRepository = dataStore.repositories.serviceAccounts;
const serviceAccountTokenRepository = dataStore.repositories.serviceAccountTokens;
const originalServiceAccountFindActiveById = serviceAccountRepository.findActiveById;
const originalServiceAccountTouchLastUsed = serviceAccountRepository.touchLastUsed;
const originalServiceAccountTokenFindById = serviceAccountTokenRepository.findById;
const originalServiceAccountTokenTouchLastUsed = serviceAccountTokenRepository.touchLastUsed;

afterEach(() => {
  serviceAccountRepository.findActiveById = originalServiceAccountFindActiveById;
  serviceAccountRepository.touchLastUsed = originalServiceAccountTouchLastUsed;
  serviceAccountTokenRepository.findById = originalServiceAccountTokenFindById;
  serviceAccountTokenRepository.touchLastUsed = originalServiceAccountTokenTouchLastUsed;
});

test("normalizeServiceAccountScopes keeps only supported unique values", () => {
  const scopes = normalizeServiceAccountScopes([
    "OPS:READ",
    " datasource:mint ",
    "unknown",
    "ops:read",
    "",
    null,
  ]);
  assert.deepEqual(scopes, ["datasource:mint", "ops:read"]);
});

test("authenticateServiceAccountToken validates hash and updates lastUsedAt", async () => {
  const secret = "local-secret-123";
  const tokenId = "token-1";
  const tokenHash = crypto
    .createHash("sha256")
    .update(`${secret}:${config.jwtSecret}`)
    .digest("hex");

  const tokenRecord = {
    _id: tokenId,
    serviceAccountId: "svc-1",
    scopes: ["ops:read", "datasource:mint"],
    tokenHash,
    revokedAt: null,
    expiresAt: null,
  };
  const accountRecord = {
    _id: "svc-1",
    name: "integration-bot",
    active: true,
    scopes: ["ops:read", "datasource:mint"],
  };

  serviceAccountTokenRepository.findById = async ({ tokenId: lookupTokenId }) =>
    lookupTokenId === tokenId ? tokenRecord : null;
  serviceAccountRepository.findActiveById = async ({ accountId }) =>
    accountId === "svc-1" ? accountRecord : null;

  let tokenLastUsedUpdateSeen = false;
  let accountLastUsedUpdateSeen = false;
  serviceAccountTokenRepository.touchLastUsed = async () => {
    tokenLastUsedUpdateSeen = true;
  };
  serviceAccountRepository.touchLastUsed = async () => {
    accountLastUsedUpdateSeen = true;
  };

  const result = await authenticateServiceAccountToken(`fsa_${tokenId}.${secret}`);

  assert.equal(result?.serviceAccount?._id, "svc-1");
  assert.deepEqual(result?.scopes, ["datasource:mint", "ops:read"]);
  assert.equal(tokenLastUsedUpdateSeen, true);
  assert.equal(accountLastUsedUpdateSeen, true);
});

test("authenticateServiceAccountToken rejects invalid token hash", async () => {
  serviceAccountTokenRepository.findById = async () => ({
    _id: "token-1",
    serviceAccountId: "svc-1",
    scopes: ["ops:read"],
    tokenHash: "not-a-real-hash",
    revokedAt: null,
    expiresAt: null,
  });
  serviceAccountRepository.findActiveById = async () => ({
    _id: "svc-1",
    active: true,
    scopes: ["ops:read"],
    name: "ops",
    description: "",
    createdByUserId: null,
    lastUsedAt: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  });

  const result = await authenticateServiceAccountToken("fsa_token-1.secret");
  assert.equal(result, null);
});
