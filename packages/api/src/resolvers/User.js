/**
 * @module resolvers/User
 * @description GraphQL resolver definitions for user queries and mutations.
 */

/**
 * @typedef {Object} IResolvers
 *   Alias for the resolver map type from @graphql-tools/utils.
 *
 * @typedef {Object} GraphQLResolveInfo
 *   Alias for GraphQLResolveInfo from graphql.
 */

import { createGraphQLError } from "graphql-yoga";
import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import User from "../models/User.js";
import Dashboard from "../models/Dashboard.js";
import InviteToken from "../models/InviteToken.js";
import PasswordResetToken from "../models/PasswordResetToken.js";
import {
  createAuthToken,
  ensureLimitOfUsersIsNotReached,
  ensureThatUserIsAdministrator,
  ensureThatUserIsLogged,
  getUser,
} from "../auth.js";
import { recordAuditEvent } from "../audit.js";
import { getAuthPolicyState } from "../policyStore.js";
import { normalizeNonAdminRole, normalizeRole } from "../policy.js";
import {
  getCredentialPolicyHints,
  isStrongPassword,
  isValidEmail,
  normalizeEmail,
} from "../validators.js";
import { generateOneTimeToken, hashOneTimeToken } from "../tokenSecurity.js";
import {
  buildLoginThrottleKey,
  clearLoginThrottle,
  getLoginThrottleState,
  recordFailedLoginAttempt,
} from "../loginThrottle.js";

const credentialPolicy = getCredentialPolicyHints();
const roleSortPriority = Object.freeze({
  admin: 0,
  editor: 1,
  viewer: 2,
});

const INVITE_DEFAULT_EXPIRY_HOURS = 72;
const PASSWORD_RESET_DEFAULT_EXPIRY_HOURS = 2;
const PASSWORD_RESET_ADMIN_DEFAULT_EXPIRY_HOURS = 24;
const MAX_TOKEN_EXPIRY_HOURS = 24 * 14;

const toComparableId = (value) => {
  if (!value) {
    return null;
  }
  if (typeof value?.toString === "function") {
    return value.toString();
  }
  return String(value);
};

const generateShareToken = () => crypto.randomBytes(24).toString("base64url");

const clampExpiryHours = (inputHours, fallbackHours) => {
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

const computeExpiryDate = (hours) =>
  new Date(Date.now() + clampExpiryHours(hours, 1) * 60 * 60 * 1000);

const ensureSelfRegistrationAllowed = (registrationMode) => {
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

const ensureAtLeastOneActiveAdminWillRemain = async (excludedUserId) => {
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

const findFallbackActiveAdmin = async (excludedUserId = null) => {
  const filter = {
    role: "admin",
    active: true,
  };
  if (excludedUserId) {
    filter._id = { $ne: excludedUserId };
  }
  return User.findOne(filter).sort({ registrationDate: 1 }).lean();
};

const reconcileDashboardAccessForRemovedUser = async ({
  targetUserId,
  replacementOwnerUserId = null,
  actorUserId = null,
  reason = "user_delete",
}) => {
  const normalizedTargetUserId = toComparableId(targetUserId);
  const normalizedReplacementOwnerUserId = toComparableId(replacementOwnerUserId);
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
    (dashboard) => toComparableId(dashboard.user) === normalizedTargetUserId
  );

  if (ownedDashboards.length > 0 && !normalizedReplacementOwnerUserId) {
    throw createGraphQLError(
      "Cannot remove user while owning dashboards without an active administrator recovery owner",
      {
        extensions: { code: "FORBIDDEN" },
      }
    );
  }

  let ownershipReassignments = 0;
  let aclRevocations = 0;

  for (const dashboard of impactedDashboards) {
    const dashboardId = toComparableId(dashboard._id);
    const ownerWasTarget = toComparableId(dashboard.user) === normalizedTargetUserId;
    const currentAcl = Array.isArray(dashboard.acl) ? dashboard.acl : [];
    const aclWithoutTarget = currentAcl.filter(
      (entry) => toComparableId(entry?.userId) !== normalizedTargetUserId
    );
    const nextAcl = ownerWasTarget
      ? aclWithoutTarget.filter(
          (entry) =>
            toComparableId(entry?.userId) !== normalizedReplacementOwnerUserId
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
      { new: true, runValidators: true }
    ).lean();

    if (!updated) {
      continue;
    }

    if (ownerWasTarget) {
      ownershipReassignments += 1;
      await recordAuditEvent({
        actorUserId,
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
        actorUserId,
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

const sortUsersForAdmin = (users) =>
  [...users].sort((a, b) => {
    const roleDelta =
      (roleSortPriority[a.role] ?? Number.MAX_SAFE_INTEGER) -
      (roleSortPriority[b.role] ?? Number.MAX_SAFE_INTEGER);
    if (roleDelta !== 0) {
      return roleDelta;
    }
    return (
      new Date(a.registrationDate).valueOf() - new Date(b.registrationDate).valueOf()
    );
  });

const toInviteView = (invite) => ({
  _id: invite._id,
  email: invite.email,
  role: invite.role,
  expiresAt: invite.expiresAt,
  revokedAt: invite.revokedAt || null,
  acceptedAt: invite.acceptedAt || null,
  createdAt: invite.createdAt,
});

const ensurePasswordIsStrong = (password) => {
  if (!isStrongPassword(password)) {
    throw createGraphQLError(
      `The password is not secure enough. ${credentialPolicy.password}.`
    );
  }
};

const ensureEmailIsValid = (email) => {
  if (!isValidEmail(email)) {
    throw createGraphQLError(`The email is not valid. ${credentialPolicy.email}.`);
  }
};

const toSessionVersion = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return 0;
  }
  return Math.max(0, Math.floor(parsed));
};

const issueUserAuthToken = (user) =>
  createAuthToken(
    user.email,
    user.role,
    user.active,
    user._id,
    toSessionVersion(user.sessionVersion)
  );

const findActiveInviteByToken = async (token) => {
  const tokenHash = hashOneTimeToken(token);
  const now = new Date();
  return InviteToken.findOne({
    tokenHash,
    revokedAt: null,
    acceptedAt: null,
    expiresAt: { $gt: now },
  }).lean();
};

const issueInviteToken = async ({ email, role, createdBy, expiresInHours }) => {
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
    { $set: { revokedAt: now } }
  );

  const rawToken = generateOneTimeToken();
  const invite = await new InviteToken({
    email: normalizedEmail,
    role: normalizedRole,
    tokenHash: hashOneTimeToken(rawToken),
    createdBy: createdBy || null,
    expiresAt: computeExpiryDate(
      clampExpiryHours(expiresInHours, INVITE_DEFAULT_EXPIRY_HOURS)
    ),
  }).save();

  return {
    invite: toInviteView(invite),
    token: rawToken,
  };
};

const issuePasswordResetToken = async ({
  user,
  createdBy = null,
  requestedByEmail = null,
  expiresInHours = PASSWORD_RESET_DEFAULT_EXPIRY_HOURS,
}) => {
  const now = new Date();
  await PasswordResetToken.updateMany(
    {
      userId: user._id,
      revokedAt: null,
      usedAt: null,
      expiresAt: { $gt: now },
    },
    { $set: { revokedAt: now } }
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

export default /** @type {IResolvers} */ {
  Query: {
    /**
     * Allows administrators to list all registered users.
     *
     * @param {any} parent
     * @param {any} args
     * @param {Object} context - GraphQL context containing authenticated user.
     * @param {GraphQLResolveInfo} info
     * @returns {Promise<Object[]>} Array of user documents.
     */
    listAllUsers: async (parent, args, context) => {
      ensureThatUserIsLogged(context);
      ensureThatUserIsAdministrator(context);

      const users = await User.find().lean();
      return sortUsersForAdmin(users);
    },

    /**
     * Fetch the currently authenticated user.
     *
     * @param {any} parent
     * @param {any} args
     * @param {Object} context
     * @returns {Promise<Object>}
     */
    me: async (parent, args, context) => {
      ensureThatUserIsLogged(context);
      return getUser(context);
    },

    /**
     * List pending invites.
     *
     * @param {any} parent
     * @param {any} args
     * @param {Object} context
     * @returns {Promise<Object[]>}
     */
    listPendingInvites: async (parent, args, context) => {
      ensureThatUserIsLogged(context);
      ensureThatUserIsAdministrator(context);

      const now = new Date();
      const invites = await InviteToken.find({
        revokedAt: null,
        acceptedAt: null,
        expiresAt: { $gt: now },
      })
        .sort({ createdAt: "desc" })
        .lean();
      return invites.map(toInviteView);
    },
  },
  Mutation: {
    /**
     * Register a new user if the user limit is not reached and credentials are valid.
     *
     * @param {any} parent
     * @param {{ email: string, password: string }} args - User email and password.
     * @returns {Promise<{ token: string }>} Signed JWT for the new user.
     * @throws {GraphQLError} When input data is invalid or user limit exceeded.
     */
    registerUser: async (parent, { email, password }) => {
      if (!email || !password) {
        throw createGraphQLError("Data provided is not valid");
      }

      const authPolicy = await getAuthPolicyState();
      ensureSelfRegistrationAllowed(authPolicy.registrationMode);

      const normalizedEmail = normalizeEmail(email);
      ensureEmailIsValid(normalizedEmail);
      ensurePasswordIsStrong(password);

      const registeredUsersCount = await User.estimatedDocumentCount();
      ensureLimitOfUsersIsNotReached(registeredUsersCount);

      const isAnEmailAlreadyRegistered = await User.findOne({
        email: normalizedEmail,
      }).lean();
      if (isAnEmailAlreadyRegistered) {
        throw createGraphQLError("Data provided is not valid");
      }

      const createdUser = await new User({
        email: normalizedEmail,
        password,
        role: authPolicy.registrationDefaultRole,
        active: true,
      }).save();
      const user = await User.findOne({ _id: createdUser._id }).lean();
      if (!user) {
        throw createGraphQLError("User not found or login not allowed");
      }

      await recordAuditEvent({
        actorUserId: user._id,
        action: "user.self_registered",
        targetType: "user",
        targetId: user._id,
        metadata: {
          registrationMode: authPolicy.registrationMode,
          role: user.role,
        },
      });

      return {
        token: issueUserAuthToken(user),
      };
    },

    /**
     * Accept invite token and register account.
     *
     * @param {any} parent
     * @param {{ token: string, password: string }} args
     * @returns {Promise<{ token: string }>}
     */
    acceptInvite: async (parent, { token, password }) => {
      if (!token || !password) {
        throw createGraphQLError("Data provided is not valid");
      }
      ensurePasswordIsStrong(password);

      const invite = await findActiveInviteByToken(token);
      if (!invite) {
        throw createGraphQLError("Invite token is invalid or expired", {
          extensions: { code: "FORBIDDEN" },
        });
      }

      const existingUser = await User.findOne({ email: invite.email }).lean();
      if (existingUser) {
        throw createGraphQLError("Invite token is invalid or expired", {
          extensions: { code: "FORBIDDEN" },
        });
      }

      const registeredUsersCount = await User.estimatedDocumentCount();
      ensureLimitOfUsersIsNotReached(registeredUsersCount);

      const createdUser = await new User({
        email: invite.email,
        password,
        role: invite.role,
        active: true,
      }).save();
      const user = await User.findOne({ _id: createdUser._id }).lean();
      if (!user) {
        throw createGraphQLError("User not found or login not allowed");
      }

      await InviteToken.findOneAndUpdate(
        { _id: invite._id },
        { $set: { acceptedAt: new Date(), acceptedUserId: user._id } },
        { new: false }
      ).lean();

      await recordAuditEvent({
        actorUserId: user._id,
        action: "invite.accepted",
        targetType: "invite",
        targetId: invite._id,
        metadata: {
          email: invite.email,
          role: invite.role,
          acceptedUserId: user._id,
        },
      });

      return {
        token: issueUserAuthToken(user),
      };
    },

    /**
     * Authenticate existing user and return a JWT token.
     *
     * @param {any} parent
     * @param {{ email: string, password: string }} args - User email and password.
     * @returns {Promise<{ token: string }>} Signed JWT for the authenticated user.
     * @throws {GraphQLError} When credentials are invalid or user not found.
     */
    authUser: async (parent, { email, password }, context) => {
      if (!email || !password) {
        throw createGraphQLError("Invalid credentials");
      }

      const normalizedEmail = normalizeEmail(email);
      const throttleKey = buildLoginThrottleKey(normalizedEmail, context?.clientIp);
      const throttleState = getLoginThrottleState(throttleKey);
      if (throttleState.blocked) {
        const retryAfterSeconds = Math.max(
          1,
          Math.ceil(throttleState.retryAfterMs / 1000)
        );
        await recordAuditEvent({
          actorUserId: null,
          action: "auth.login.blocked",
          targetType: "user",
          targetId: null,
          metadata: {
            email: normalizedEmail,
            clientIp: context?.clientIp || null,
            retryAfterSeconds,
          },
        });
        throw createGraphQLError(
          `Too many login attempts. Try again in ${retryAfterSeconds} seconds.`,
          {
            extensions: { code: "TOO_MANY_REQUESTS" },
          }
        );
      }

      const registerFailure = async () => {
        const failure = recordFailedLoginAttempt(throttleKey);
        if (!failure.justLocked) {
          return;
        }
        await recordAuditEvent({
          actorUserId: null,
          action: "auth.login.locked",
          targetType: "user",
          targetId: null,
          metadata: {
            email: normalizedEmail,
            clientIp: context?.clientIp || null,
            retryAfterSeconds: Math.max(1, Math.ceil(failure.retryAfterMs / 1000)),
          },
        });
      };

      const user = await User.findOne({
        email: normalizedEmail,
      }).lean();

      if (!user) {
        await registerFailure();
        throw createGraphQLError("Invalid credentials");
      }
      if (!user.active) {
        await registerFailure();
        throw createGraphQLError(
          "Your account is deactivated. Contact an administrator.",
          {
            extensions: { code: "FORBIDDEN" },
          }
        );
      }

      const isCorrectPassword = await bcrypt.compare(password, user.password);
      if (!isCorrectPassword) {
        await registerFailure();
        throw createGraphQLError("Invalid credentials");
      }

      clearLoginThrottle(throttleKey);

      await User.findOneAndUpdate(
        { _id: user._id },
        { $set: { lastLogin: new Date() } },
        { new: false }
      ).lean();

      return {
        token: issueUserAuthToken(user),
      };
    },

    /**
     * Initiate password reset flow for an email.
     *
     * @param {any} parent
     * @param {{ email: string }} args
     * @returns {Promise<boolean>}
     */
    requestPasswordReset: async (parent, { email }) => {
      const normalizedEmail = normalizeEmail(email);
      if (!normalizedEmail || !isValidEmail(normalizedEmail)) {
        return true;
      }

      const user = await User.findOne({
        email: normalizedEmail,
        active: true,
      }).lean();
      if (!user) {
        return true;
      }

      await issuePasswordResetToken({
        user,
        createdBy: null,
        requestedByEmail: normalizedEmail,
        expiresInHours: PASSWORD_RESET_DEFAULT_EXPIRY_HOURS,
      });

      await recordAuditEvent({
        actorUserId: null,
        action: "password_reset.requested",
        targetType: "user",
        targetId: user._id,
        metadata: { requestedByEmail: normalizedEmail },
      });

      return true;
    },

    /**
     * Complete password reset flow with one-time token.
     *
     * @param {any} parent
     * @param {{ token: string, password: string }} args
     * @returns {Promise<boolean>}
     */
    resetPassword: async (parent, { token, password }) => {
      if (!token || !password) {
        throw createGraphQLError("Data provided is not valid");
      }
      ensurePasswordIsStrong(password);

      const tokenHash = hashOneTimeToken(token);
      const now = new Date();
      const reset = await PasswordResetToken.findOne({
        tokenHash,
        revokedAt: null,
        usedAt: null,
        expiresAt: { $gt: now },
      }).lean();

      if (!reset) {
        throw createGraphQLError("Password reset token is invalid or expired", {
          extensions: { code: "FORBIDDEN" },
        });
      }

      const user = await User.findOne({
        _id: reset.userId,
        active: true,
      });
      if (!user) {
        throw createGraphQLError("Password reset token is invalid or expired", {
          extensions: { code: "FORBIDDEN" },
        });
      }

      user.password = password;
      user.sessionVersion = toSessionVersion(user.sessionVersion) + 1;
      await user.save();

      await PasswordResetToken.findOneAndUpdate(
        { _id: reset._id },
        { $set: { usedAt: new Date() } },
        { new: false }
      ).lean();

      await recordAuditEvent({
        actorUserId: user._id,
        action: "password_reset.completed",
        targetType: "user",
        targetId: user._id,
        metadata: { tokenId: reset._id },
      });

      return true;
    },

    /**
     * Delete the authenticated user's own account.
     *
     * @param {any} parent
     * @param {any} args
     * @param {Object} context - GraphQL context containing authenticated user.
     * @param {GraphQLResolveInfo} info
     * @returns {Promise<any>} Result of the deletion operation.
     * @throws {GraphQLError} When user is not authenticated.
     */
    deleteMyUserAccount: async (parent, args, context) => {
      ensureThatUserIsLogged(context);
      const user = await getUser(context);

      if (user.role === "admin") {
        await ensureAtLeastOneActiveAdminWillRemain(user._id);
      }

      const fallbackAdmin = await findFallbackActiveAdmin(user._id);
      const dashboardReconciliation = await reconcileDashboardAccessForRemovedUser({
        targetUserId: user._id,
        replacementOwnerUserId: fallbackAdmin?._id || null,
        actorUserId: user._id,
        reason: "self_delete",
      });

      const deletedUser = await User.findOneAndDelete({ _id: user._id }).lean();
      if (!deletedUser) {
        throw createGraphQLError("User not found or login not allowed");
      }

      await recordAuditEvent({
        actorUserId: user._id,
        action: "user.self_deleted",
        targetType: "user",
        targetId: user._id,
        metadata: {
          email: user.email,
          role: user.role,
          dashboardOwnershipReassignments:
            dashboardReconciliation.ownershipReassignments,
          dashboardAclRevocations: dashboardReconciliation.aclRevocations,
        },
      });

      return deletedUser;
    },

    /**
     * Create a user account as administrator.
     *
     * @param {any} parent
     * @param {{ email: string, password: string, role: string, active?: boolean }} args
     * @param {Object} context
     * @returns {Promise<Object>}
     */
    adminCreateUser: async (parent, { email, password, role, active = true }, context) => {
      ensureThatUserIsLogged(context);
      ensureThatUserIsAdministrator(context);

      const normalizedEmail = normalizeEmail(email);
      ensureEmailIsValid(normalizedEmail);
      ensurePasswordIsStrong(password);
      const normalizedRole = normalizeRole(role);

      const existingUser = await User.findOne({ email: normalizedEmail }).lean();
      if (existingUser) {
        throw createGraphQLError("Data provided is not valid");
      }

      const registeredUsersCount = await User.estimatedDocumentCount();
      ensureLimitOfUsersIsNotReached(registeredUsersCount);

      const createdUser = await new User({
        email: normalizedEmail,
        password,
        role: normalizedRole,
        active: Boolean(active),
      }).save();
      const created = await User.findOne({ _id: createdUser._id }).lean();
      if (!created) {
        throw createGraphQLError("User not found or login not allowed");
      }

      await recordAuditEvent({
        actorUserId: context.user._id,
        action: "user.admin_created",
        targetType: "user",
        targetId: created._id,
        metadata: { role: created.role, active: created.active },
      });

      return created;
    },

    /**
     * Create invite token as administrator.
     *
     * @param {any} parent
     * @param {{ email: string, role: string, expiresInHours?: number }} args
     * @param {Object} context
     * @returns {Promise<{invite: Object, token: string}>}
     */
    adminCreateInvite: async (parent, { email, role, expiresInHours }, context) => {
      ensureThatUserIsLogged(context);
      ensureThatUserIsAdministrator(context);

      const payload = await issueInviteToken({
        email,
        role,
        createdBy: context.user._id,
        expiresInHours: clampExpiryHours(expiresInHours, INVITE_DEFAULT_EXPIRY_HOURS),
      });

      await recordAuditEvent({
        actorUserId: context.user._id,
        action: "invite.created",
        targetType: "invite",
        targetId: payload.invite._id,
        metadata: {
          email: payload.invite.email,
          role: payload.invite.role,
          expiresAt: payload.invite.expiresAt,
        },
      });

      return payload;
    },

    /**
     * Revoke invite token as administrator.
     *
     * @param {any} parent
     * @param {{ _id: string }} args
     * @param {Object} context
     * @returns {Promise<boolean>}
     */
    adminRevokeInvite: async (parent, { _id }, context) => {
      ensureThatUserIsLogged(context);
      ensureThatUserIsAdministrator(context);

      const now = new Date();
      const updated = await InviteToken.findOneAndUpdate(
        {
          _id,
          revokedAt: null,
          acceptedAt: null,
          expiresAt: { $gt: now },
        },
        { $set: { revokedAt: now } },
        { new: true }
      ).lean();

      if (updated) {
        await recordAuditEvent({
          actorUserId: context.user._id,
          action: "invite.revoked",
          targetType: "invite",
          targetId: _id,
          metadata: { email: updated.email },
        });
      }

      return Boolean(updated);
    },

    /**
     * Update a user account as administrator.
     *
     * @param {any} parent
     * @param {{ _id: string, role?: string, active?: boolean }} args
     * @param {Object} context
     * @returns {Promise<Object>}
     */
    adminUpdateUser: async (parent, { _id, role, active }, context) => {
      ensureThatUserIsLogged(context);
      ensureThatUserIsAdministrator(context);

      const user = await User.findOne({ _id }).lean();
      if (!user) {
        throw createGraphQLError("User not found or login not allowed");
      }

      const update = {};
      if (role !== undefined) {
        update.role = normalizeRole(role);
      }
      if (active !== undefined) {
        update.active = Boolean(active);
      }
      if (Object.keys(update).length === 0) {
        return user;
      }

      const roleChanged =
        update.role !== undefined && update.role !== String(user.role || "");
      const activeChanged =
        update.active !== undefined && update.active !== Boolean(user.active);
      const shouldRevokeSessions = roleChanged || activeChanged;

      if (String(_id) === String(context.user._id) && update.role && update.role !== "admin") {
        throw createGraphQLError("Administrators cannot demote themselves", {
          extensions: { code: "FORBIDDEN" },
        });
      }

      const adminPrivilegeRemoved =
        user.role === "admin" &&
        ((update.role && update.role !== "admin") || update.active === false);
      if (adminPrivilegeRemoved) {
        await ensureAtLeastOneActiveAdminWillRemain(user._id);
      }

      const updateDocument = {
        $set: update,
        ...(shouldRevokeSessions ? { $inc: { sessionVersion: 1 } } : {}),
      };

      const updatedUser = await User.findOneAndUpdate(
        { _id },
        updateDocument,
        { new: true, runValidators: true }
      ).lean();
      if (!updatedUser) {
        throw createGraphQLError("User not found or login not allowed");
      }

      await recordAuditEvent({
        actorUserId: context.user._id,
        action: "user.admin_updated",
        targetType: "user",
        targetId: updatedUser._id,
        metadata: {
          update,
          sessionsRevoked: shouldRevokeSessions,
        },
      });

      return updatedUser;
    },

    /**
     * Delete a user account as administrator.
     *
     * @param {any} parent
     * @param {{ _id: string }} args
     * @param {Object} context
     * @returns {Promise<Object>}
     */
    adminDeleteUser: async (parent, { _id }, context) => {
      ensureThatUserIsLogged(context);
      ensureThatUserIsAdministrator(context);

      if (String(_id) === String(context.user._id)) {
        throw createGraphQLError("Administrators cannot delete their own account", {
          extensions: { code: "FORBIDDEN" },
        });
      }

      const user = await User.findOne({ _id }).lean();
      if (!user) {
        throw createGraphQLError("User not found or login not allowed");
      }
      if (user.active) {
        throw createGraphQLError(
          "Deactivate the user account before permanent deletion",
          {
            extensions: { code: "FORBIDDEN" },
          }
        );
      }
      if (user.role === "admin") {
        await ensureAtLeastOneActiveAdminWillRemain(user._id);
      }

      const dashboardReconciliation = await reconcileDashboardAccessForRemovedUser({
        targetUserId: user._id,
        replacementOwnerUserId: context.user._id,
        actorUserId: context.user._id,
        reason: "admin_delete",
      });

      const deletedUser = await User.findOneAndDelete({ _id }).lean();
      if (!deletedUser) {
        throw createGraphQLError("User not found or login not allowed");
      }

      await recordAuditEvent({
        actorUserId: context.user._id,
        action: "user.admin_deleted",
        targetType: "user",
        targetId: deletedUser._id,
        metadata: {
          email: deletedUser.email,
          role: deletedUser.role,
          dashboardOwnershipReassignments:
            dashboardReconciliation.ownershipReassignments,
          dashboardAclRevocations: dashboardReconciliation.aclRevocations,
        },
      });

      return deletedUser;
    },

    /**
     * Admin-only password reset token issuance.
     *
     * @param {any} parent
     * @param {{ _id: string, expiresInHours?: number }} args
     * @param {Object} context
     * @returns {Promise<{userId: string, token: string, expiresAt: Date}>}
     */
    adminIssuePasswordReset: async (parent, { _id, expiresInHours }, context) => {
      ensureThatUserIsLogged(context);
      ensureThatUserIsAdministrator(context);

      const user = await User.findOne({ _id, active: true }).lean();
      if (!user) {
        throw createGraphQLError("User not found or login not allowed");
      }

      const payload = await issuePasswordResetToken({
        user,
        createdBy: context.user._id,
        requestedByEmail: null,
        expiresInHours: clampExpiryHours(
          expiresInHours,
          PASSWORD_RESET_ADMIN_DEFAULT_EXPIRY_HOURS
        ),
      });

      await recordAuditEvent({
        actorUserId: context.user._id,
        action: "password_reset.admin_issued",
        targetType: "user",
        targetId: user._id,
        metadata: { expiresAt: payload.expiresAt },
      });

      return payload;
    },
  },
};
