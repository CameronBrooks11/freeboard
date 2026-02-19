/**
 * @module serviceAccountAuth
 * @description Service account token issuance and bearer-token authentication helpers.
 */

import crypto from "node:crypto";
import ServiceAccount from "./models/ServiceAccount.js";
import ServiceAccountToken from "./models/ServiceAccountToken.js";
import { config } from "./config.js";
import { SERVICE_ACCOUNT_SCOPES } from "./serviceAccountScopes.js";

const SERVICE_ACCOUNT_SCOPE_SET = new Set(SERVICE_ACCOUNT_SCOPES);

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
  return {
    tokenId: match[1],
    secret: match[2],
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
  const account = await ServiceAccount.findOne({ _id: serviceAccountId, active: true }).lean();
  if (!account) {
    return null;
  }

  const tokenScopes = normalizeServiceAccountScopes(scopes);
  const resolvedScopes =
    tokenScopes.length > 0 ? tokenScopes : normalizeServiceAccountScopes(account.scopes);
  const secret = generateSecret();
  const tokenHash = hashSecret(secret);
  const expiresAt =
    expiresInHours === null || expiresInHours === undefined
      ? null
      : new Date(Date.now() + Math.max(1, Math.floor(Number(expiresInHours) || 1)) * 3600_000);

  const tokenDoc = await new ServiceAccountToken({
    serviceAccountId: toComparableId(account._id),
    scopes: resolvedScopes,
    label: String(label || "").trim() || null,
    tokenHash,
    tokenPrefix: secret.slice(0, 8),
    expiresAt,
    createdByUserId: toComparableId(actorUserId),
  }).save();

  const createdToken = await ServiceAccountToken.findOne({ _id: tokenDoc._id }).lean();
  if (!createdToken) {
    return null;
  }

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

  const tokenRecord = await ServiceAccountToken.findOne({ _id: parsed.tokenId }).lean();
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

  const account = await ServiceAccount.findOne({
    _id: tokenRecord.serviceAccountId,
    active: true,
  }).lean();
  if (!account) {
    return null;
  }

  const now = new Date();
  await Promise.allSettled([
    ServiceAccountToken.updateOne({ _id: tokenRecord._id }, { $set: { lastUsedAt: now } }),
    ServiceAccount.updateOne({ _id: account._id }, { $set: { lastUsedAt: now } }),
  ]);

  return {
    serviceAccount: account,
    tokenRecord,
    scopes: normalizeServiceAccountScopes(tokenRecord.scopes),
  };
};
