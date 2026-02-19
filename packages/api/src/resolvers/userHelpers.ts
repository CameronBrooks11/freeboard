/**
 * @module resolvers/userHelpers
 * @description Shared user resolver helper logic for auth, invites, resets, and offboarding.
 */

import { createGraphQLError } from "graphql-yoga";
import crypto from "node:crypto";
import User from "../models/User.js";
import Dashboard from "../models/Dashboard.js";
import InviteToken from "../models/InviteToken.js";
import PasswordResetToken from "../models/PasswordResetToken.js";
import { createAuthToken } from "../auth.js";
import { recordAuditEvent } from "../audit.js";
import { normalizeNonAdminRole } from "../policy.js";
import {
  getCredentialPolicyHints,
  isStrongPassword,
  isValidEmail,
  normalizeEmail,
} from "../validators.js";
import { generateOneTimeToken, hashOneTimeToken } from "../tokenSecurity.js";
type UserLike = {
  _id?: unknown;
  email?: unknown;
  role?: unknown;
  active?: unknown;
  sessionVersion?: unknown;
  registrationDate?: unknown;
};
type InviteLike = {
  _id?: unknown;
  email?: unknown;
  role?: unknown;
  expiresAt?: unknown;
  revokedAt?: unknown;
  acceptedAt?: unknown;
  createdAt?: unknown;
};

const credentialPolicy = getCredentialPolicyHints();
const roleSortPriority = Object.freeze({
  admin: 0,
  editor: 1,
  viewer: 2,
});

export const INVITE_DEFAULT_EXPIRY_HOURS = 72;
export const PASSWORD_RESET_DEFAULT_EXPIRY_HOURS = 2;
export const PASSWORD_RESET_ADMIN_DEFAULT_EXPIRY_HOURS = 24;
const MAX_TOKEN_EXPIRY_HOURS = 24 * 14;

const toComparableId = (value: unknown): string | null => {
  if (!value) {
    return null;
  }
  if (typeof value?.toString === "function") {
    return value.toString();
  }
  return String(value);
};

const generateShareToken = () => crypto.randomBytes(24).toString("base64url");

export const clampExpiryHours = (inputHours: unknown, fallbackHours: number): number => {
  const parsed = Number(inputHours);
  if (!Number.isFinite(parsed)) {
    return fallbackHours;
  }
  if (parsed < 1) {
    return 1;
  }
  if (parsed > MAX_TOKEN_EXPIRY_HOURS) {
    return MAX_TOKEN_EXPIRY_HOURS;
  }
  return Math.floor(parsed);
};

const computeExpiryDate = (hours: unknown) =>
  new Date(Date.now() + clampExpiryHours(hours, 1) * 60 * 60 * 1000);

export const ensureSelfRegistrationAllowed = (registrationMode: unknown): void => {
  if (registrationMode === "open") {
    return;
  }

  if (registrationMode === "invite") {
    throw createGraphQLError("Invitation is required to create an account", {
      extensions: { code: "FORBIDDEN" },
    });
  }

  throw createGraphQLError("Self-registration is disabled", {
    extensions: { code: "FORBIDDEN" },
  });
};

export const ensureAtLeastOneActiveAdminWillRemain = async (excludedUserId: unknown) => {
  const remainingAdmins = await User.countDocuments({
    role: "admin",
    active: true,
    _id: { $ne: excludedUserId },
  });
  if (remainingAdmins === 0) {
    throw createGraphQLError("At least one active administrator must remain", {
      extensions: { code: "FORBIDDEN" },
    });
  }
};

export const findFallbackActiveAdmin = async (excludedUserId: unknown = null) => {
  const filter: Record<string, unknown> = {
    role: "admin",
    active: true,
  };
  if (excludedUserId) {
    filter._id = { $ne: excludedUserId };
  }
  return User.findOne(filter).sort({ registrationDate: 1 }).lean();
};

export const reconcileDashboardAccessForRemovedUser = async ({
  targetUserId,
  replacementOwnerUserId = null,
  actorUserId = null,
  reason = "user_delete",
}: {
  targetUserId: unknown;
  replacementOwnerUserId?: unknown;
  actorUserId?: unknown;
  reason?: string;
}) => {
  const normalizedTargetUserId = toComparableId(targetUserId);
  const normalizedReplacementOwnerUserId = toComparableId(replacementOwnerUserId);
  const normalizedActorUserId = toComparableId(actorUserId);
  if (!normalizedTargetUserId) {
    return {
      ownershipReassignments: 0,
      aclRevocations: 0,
    };
  }

  const impactedDashboards = await Dashboard.find({
    $or: [
      { user: normalizedTargetUserId },
      { acl: { $elemMatch: { userId: normalizedTargetUserId } } },
    ],
  }).lean();

  const ownedDashboards = impactedDashboards.filter(
    (dashboard) => toComparableId(dashboard.user) === normalizedTargetUserId,
  );

  if (ownedDashboards.length > 0 && !normalizedReplacementOwnerUserId) {
    throw createGraphQLError(
      "Cannot remove user while owning dashboards without an active administrator recovery owner",
      {
        extensions: { code: "FORBIDDEN" },
      },
    );
  }

  let ownershipReassignments = 0;
  let aclRevocations = 0;

  for (const dashboard of impactedDashboards) {
    const dashboardId = toComparableId(dashboard._id);
    const ownerWasTarget = toComparableId(dashboard.user) === normalizedTargetUserId;
    const currentAcl: Array<{ userId?: unknown }> = Array.isArray(dashboard.acl)
      ? (dashboard.acl as Array<{ userId?: unknown }>)
      : [];
    const aclWithoutTarget = currentAcl.filter(
      (entry) => toComparableId(entry?.userId) !== normalizedTargetUserId,
    );
    const nextAcl = ownerWasTarget
      ? aclWithoutTarget.filter(
          (entry) => toComparableId(entry?.userId) !== normalizedReplacementOwnerUserId,
        )
      : aclWithoutTarget;
    const aclChanged = nextAcl.length !== currentAcl.length;

    if (!ownerWasTarget && !aclChanged) {
      continue;
    }

    const update = ownerWasTarget
      ? {
          user: normalizedReplacementOwnerUserId,
          visibility: "private",
          shareToken: generateShareToken(),
          acl: nextAcl,
        }
      : {
          acl: nextAcl,
        };

    const updated = await Dashboard.findOneAndUpdate(
      { _id: dashboardId },
      { $set: update },
      { new: true, runValidators: true },
    ).lean();

    if (!updated) {
      continue;
    }

    if (ownerWasTarget) {
      ownershipReassignments += 1;
      await recordAuditEvent({
        actorUserId: normalizedActorUserId,
        action: "dashboard.ownership.reassigned_for_user_offboarding",
        targetType: "dashboard",
        targetId: dashboardId,
        metadata: {
          fromUserId: normalizedTargetUserId,
          toUserId: normalizedReplacementOwnerUserId,
          reason,
          forcedPrivate: true,
        },
      });
    }

    if (aclChanged) {
      aclRevocations += 1;
      await recordAuditEvent({
        actorUserId: normalizedActorUserId,
        action: "dashboard.acl.revoked_for_user_offboarding",
        targetType: "dashboard",
        targetId: dashboardId,
        metadata: {
          userId: normalizedTargetUserId,
          reason,
        },
      });
    }
  }

  return {
    ownershipReassignments,
    aclRevocations,
  };
};

export const sortUsersForAdmin = (users: UserLike[]) =>
  [...users].sort((a, b) => {
    const leftRole = String(a.role || "").toLowerCase() as keyof typeof roleSortPriority;
    const rightRole = String(b.role || "").toLowerCase() as keyof typeof roleSortPriority;
    const roleDelta =
      (roleSortPriority[leftRole] ?? Number.MAX_SAFE_INTEGER) -
      (roleSortPriority[rightRole] ?? Number.MAX_SAFE_INTEGER);
    if (roleDelta !== 0) {
      return roleDelta;
    }
    const leftDate = new Date(
      a.registrationDate instanceof Date ? a.registrationDate : String(a.registrationDate || 0),
    ).valueOf();
    const rightDate = new Date(
      b.registrationDate instanceof Date ? b.registrationDate : String(b.registrationDate || 0),
    ).valueOf();
    return leftDate - rightDate;
  });

export const toInviteView = (invite: InviteLike) => ({
  _id: invite._id,
  email: invite.email,
  role: invite.role,
  expiresAt: invite.expiresAt,
  revokedAt: invite.revokedAt || null,
  acceptedAt: invite.acceptedAt || null,
  createdAt: invite.createdAt,
});

export const ensurePasswordIsStrong = (password: unknown): void => {
  if (!isStrongPassword(password)) {
    throw createGraphQLError(`The password is not secure enough. ${credentialPolicy.password}.`);
  }
};

export const ensureEmailIsValid = (email: unknown): void => {
  if (!isValidEmail(email)) {
    throw createGraphQLError(`The email is not valid. ${credentialPolicy.email}.`);
  }
};

export const toSessionVersion = (value: unknown): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return 0;
  }
  return Math.max(0, Math.floor(parsed));
};

export const issueUserAuthToken = (user: UserLike): string =>
  createAuthToken(
    String(user.email || ""),
    String(user.role || "viewer"),
    Boolean(user.active),
    String(user._id || ""),
    toSessionVersion(user.sessionVersion),
  );

export const findActiveInviteByToken = async (token: unknown) => {
  const tokenHash = hashOneTimeToken(token);
  const now = new Date();
  return InviteToken.findOne({
    tokenHash,
    revokedAt: null,
    acceptedAt: null,
    expiresAt: { $gt: now },
  }).lean();
};

export const issueInviteToken = async ({
  email,
  role,
  createdBy,
  expiresInHours,
}: {
  email: unknown;
  role: unknown;
  createdBy?: unknown;
  expiresInHours?: unknown;
}) => {
  const normalizedEmail = normalizeEmail(email);
  ensureEmailIsValid(normalizedEmail);
  const normalizedRole = normalizeNonAdminRole(role);

  const existingUser = await User.findOne({ email: normalizedEmail }).lean();
  if (existingUser) {
    throw createGraphQLError("Data provided is not valid");
  }

  const now = new Date();
  await InviteToken.updateMany(
    {
      email: normalizedEmail,
      revokedAt: null,
      acceptedAt: null,
      expiresAt: { $gt: now },
    },
    { $set: { revokedAt: now } },
  );

  const rawToken = generateOneTimeToken();
  const invite = await new InviteToken({
    email: normalizedEmail,
    role: normalizedRole,
    tokenHash: hashOneTimeToken(rawToken),
    createdBy: createdBy || null,
    expiresAt: computeExpiryDate(clampExpiryHours(expiresInHours, INVITE_DEFAULT_EXPIRY_HOURS)),
  }).save();

  return {
    invite: toInviteView(invite),
    token: rawToken,
  };
};

export const issuePasswordResetToken = async ({
  user,
  createdBy = null,
  requestedByEmail = null,
  expiresInHours = PASSWORD_RESET_DEFAULT_EXPIRY_HOURS,
}: {
  user: UserLike;
  createdBy?: unknown;
  requestedByEmail?: string | null;
  expiresInHours?: number;
}) => {
  const now = new Date();
  await PasswordResetToken.updateMany(
    {
      userId: user._id,
      revokedAt: null,
      usedAt: null,
      expiresAt: { $gt: now },
    },
    { $set: { revokedAt: now } },
  );

  const rawToken = generateOneTimeToken();
  const reset = await new PasswordResetToken({
    userId: user._id,
    tokenHash: hashOneTimeToken(rawToken),
    createdBy,
    requestedByEmail,
    expiresAt: computeExpiryDate(clampExpiryHours(expiresInHours, 1)),
  }).save();

  return {
    userId: user._id,
    token: rawToken,
    expiresAt: reset.expiresAt,
  };
};
