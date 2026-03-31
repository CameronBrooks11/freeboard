/**
 * @module serviceAccountAuth
 * Service account token issuance and bearer-token authentication helpers.
 */

import crypto from "node:crypto";
import { config } from "./config.js";
import { SERVICE_ACCOUNT_SCOPES } from "./serviceAccountScopes.js";
import { dataStore } from "./data/index.js";

const SERVICE_ACCOUNT_SCOPE_SET = new Set(SERVICE_ACCOUNT_SCOPES);
const serviceAccountRepository = dataStore.repositories.serviceAccounts;
const serviceAccountTokenRepository = dataStore.repositories.serviceAccountTokens;

const toComparableId = (value: unknown): string | null => {
  if (!value) {
    return null;
  }
  if (typeof value?.toString === "function") {
    return value.toString();
  }
  return String(value);
};

export const normalizeServiceAccountScopes = (scopes: unknown[] = []): string[] => {
  if (!Array.isArray(scopes)) {
    return [];
  }

  const normalized = scopes
    .map((scope) =>
      String(scope || "")
        .trim()
        .toLowerCase(),
    )
    .filter((scope) => SERVICE_ACCOUNT_SCOPE_SET.has(scope));

  return [...new Set(normalized)].sort();
};

const hashSecret = (secret: unknown): string =>
  crypto
    .createHash("sha256")
    .update(`${String(secret || "")}:${config.jwtSecret}`)
    .digest("hex");

const generateSecret = () => crypto.randomBytes(24).toString("base64url");

const buildToken = ({ tokenId, secret }: { tokenId: string; secret: string }): string =>
  `fsa_${tokenId}.${secret}`;

const parseToken = (rawToken: unknown): { tokenId: string; secret: string } | null => {
  const token = String(rawToken || "").trim();
  const match = token.match(/^fsa_([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)$/);
  if (!match) {
    return null;
  }
  const tokenId = match[1];
  const secret = match[2];
  if (!tokenId || !secret) {
    return null;
  }
  return {
    tokenId,
    secret,
  };
};

const equalHashes = (left: unknown, right: unknown): boolean => {
  const leftBuffer = Buffer.from(String(left || ""), "utf8");
  const rightBuffer = Buffer.from(String(right || ""), "utf8");
  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }
  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
};

export const issueServiceAccountToken = async ({
  serviceAccountId,
  scopes = [],
  label = "",
  expiresInHours = null,
  actorUserId = null,
}: {
  serviceAccountId: unknown;
  scopes?: unknown[];
  label?: string | null;
  expiresInHours?: number | null;
  actorUserId?: unknown;
}) => {
  const account = await serviceAccountRepository.findActiveById({
    accountId: String(serviceAccountId || "").trim(),
  });
  if (!account) {
    return null;
  }

  const tokenScopes = normalizeServiceAccountScopes(scopes);
  const resolvedScopes =
    tokenScopes.length > 0 ? tokenScopes : normalizeServiceAccountScopes(account.scopes);
  const normalizedAccountId = toComparableId(account._id);
  if (!normalizedAccountId) {
    return null;
  }
  const secret = generateSecret();
  const tokenHash = hashSecret(secret);
  const expiresAt =
    expiresInHours === null || expiresInHours === undefined
      ? null
      : new Date(Date.now() + Math.max(1, Math.floor(Number(expiresInHours) || 1)) * 3600_000);

  const createdToken = await serviceAccountTokenRepository.create({
    serviceAccountId: normalizedAccountId,
    scopes: resolvedScopes,
    label: String(label || "").trim() || null,
    tokenHash,
    tokenPrefix: secret.slice(0, 8),
    expiresAt,
    createdByUserId: toComparableId(actorUserId),
  });

  return {
    token: buildToken({ tokenId: createdToken._id, secret }),
    tokenRecord: createdToken,
  };
};

export const authenticateServiceAccountToken = async (rawToken: unknown) => {
  const parsed = parseToken(rawToken);
  if (!parsed) {
    return null;
  }

  const tokenRecord = await serviceAccountTokenRepository.findById({
    tokenId: parsed.tokenId,
  });
  if (!tokenRecord || tokenRecord.revokedAt) {
    return null;
  }

  if (tokenRecord.expiresAt && new Date(tokenRecord.expiresAt).getTime() <= Date.now()) {
    return null;
  }

  const expectedHash = hashSecret(parsed.secret);
  if (!equalHashes(expectedHash, tokenRecord.tokenHash)) {
    return null;
  }

  const account = await serviceAccountRepository.findActiveById({
    accountId: tokenRecord.serviceAccountId,
  });
  if (!account) {
    return null;
  }

  const now = new Date();
  await Promise.allSettled([
    serviceAccountTokenRepository.touchLastUsed({
      tokenId: tokenRecord._id,
      lastUsedAt: now,
    }),
    serviceAccountRepository.touchLastUsed({
      accountId: account._id,
      lastUsedAt: now,
    }),
  ]);

  return {
    serviceAccount: account,
    tokenRecord,
    scopes: normalizeServiceAccountScopes(tokenRecord.scopes),
  };
};
