import assert from "node:assert/strict";
import crypto from "node:crypto";
import { afterEach, test } from "node:test";

import ServiceAccount from "../src/models/ServiceAccount.js";
import ServiceAccountToken from "../src/models/ServiceAccountToken.js";
import { config } from "../src/config.js";
import {
  authenticateServiceAccountToken,
  normalizeServiceAccountScopes,
} from "../src/serviceAccountAuth.js";

const originalServiceAccountFindOne = ServiceAccount.findOne;
const originalServiceAccountUpdateOne = ServiceAccount.updateOne;
const originalServiceAccountTokenFindOne = ServiceAccountToken.findOne;
const originalServiceAccountTokenUpdateOne = ServiceAccountToken.updateOne;

const asLean = (value) => ({
  lean: async () => value,
});

afterEach(() => {
  ServiceAccount.findOne = originalServiceAccountFindOne;
  ServiceAccount.updateOne = originalServiceAccountUpdateOne;
  ServiceAccountToken.findOne = originalServiceAccountTokenFindOne;
  ServiceAccountToken.updateOne = originalServiceAccountTokenUpdateOne;
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

  ServiceAccountToken.findOne = ({ _id }) => asLean(_id === tokenId ? tokenRecord : null);
  ServiceAccount.findOne = ({ _id, active }) =>
    asLean(_id === "svc-1" && active === true ? accountRecord : null);

  let tokenLastUsedUpdateSeen = false;
  let accountLastUsedUpdateSeen = false;
  ServiceAccountToken.updateOne = async () => {
    tokenLastUsedUpdateSeen = true;
  };
  ServiceAccount.updateOne = async () => {
    accountLastUsedUpdateSeen = true;
  };

  const result = await authenticateServiceAccountToken(`fsa_${tokenId}.${secret}`);

  assert.equal(result?.serviceAccount?._id, "svc-1");
  assert.deepEqual(result?.scopes, ["datasource:mint", "ops:read"]);
  assert.equal(tokenLastUsedUpdateSeen, true);
  assert.equal(accountLastUsedUpdateSeen, true);
});

test("authenticateServiceAccountToken rejects invalid token hash", async () => {
  ServiceAccountToken.findOne = () =>
    asLean({
      _id: "token-1",
      serviceAccountId: "svc-1",
      scopes: ["ops:read"],
      tokenHash: "not-a-real-hash",
      revokedAt: null,
      expiresAt: null,
    });
  ServiceAccount.findOne = () =>
    asLean({
      _id: "svc-1",
      active: true,
      scopes: ["ops:read"],
    });

  const result = await authenticateServiceAccountToken("fsa_token-1.secret");
  assert.equal(result, null);
});
