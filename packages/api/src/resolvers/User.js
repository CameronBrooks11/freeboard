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
import bcrypt from "bcryptjs";
import User from "../models/User.js";
import InviteToken from "../models/InviteToken.js";
import PasswordResetToken from "../models/PasswordResetToken.js";
import {
  ensureLimitOfUsersIsNotReached,
  ensureThatUserIsAdministrator,
  ensureThatUserIsLogged,
  getUser,
} from "../auth.js";
import { recordAuditEvent } from "../audit.js";
import { getAuthPolicyState } from "../policyStore.js";
import { normalizeRole } from "../policy.js";
import { isValidEmail, normalizeEmail } from "../validators.js";
import { hashOneTimeToken } from "../tokenSecurity.js";
import {
  buildLoginThrottleKey,
  clearLoginThrottle,
  getLoginThrottleState,
  recordFailedLoginAttempt,
} from "../loginThrottle.js";
import { recordAuthFailureMetric } from "../runtimeMetrics.js";
import {
  clampExpiryHours,
  ensureAtLeastOneActiveAdminWillRemain,
  ensureEmailIsValid,
  ensurePasswordIsStrong,
  ensureSelfRegistrationAllowed,
  findActiveInviteByToken,
  findFallbackActiveAdmin,
  INVITE_DEFAULT_EXPIRY_HOURS,
  issueInviteToken,
  issuePasswordResetToken,
  issueUserAuthToken,
  PASSWORD_RESET_ADMIN_DEFAULT_EXPIRY_HOURS,
  PASSWORD_RESET_DEFAULT_EXPIRY_HOURS,
  reconcileDashboardAccessForRemovedUser,
  sortUsersForAdmin,
  toInviteView,
  toSessionVersion,
} from "./userHelpers.js";

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
        { new: false },
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
        recordAuthFailureMetric();
        const retryAfterSeconds = Math.max(1, Math.ceil(throttleState.retryAfterMs / 1000));
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
          },
        );
      }

      const registerFailure = async () => {
        recordAuthFailureMetric();
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
        throw createGraphQLError("Your account is deactivated. Contact an administrator.", {
          extensions: { code: "FORBIDDEN" },
        });
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
        { new: false },
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
        { new: false },
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
          dashboardOwnershipReassignments: dashboardReconciliation.ownershipReassignments,
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
        { new: true },
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

      const roleChanged = update.role !== undefined && update.role !== String(user.role || "");
      const activeChanged = update.active !== undefined && update.active !== Boolean(user.active);
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

      const updatedUser = await User.findOneAndUpdate({ _id }, updateDocument, {
        new: true,
        runValidators: true,
      }).lean();
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
        throw createGraphQLError("Deactivate the user account before permanent deletion", {
          extensions: { code: "FORBIDDEN" },
        });
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
          dashboardOwnershipReassignments: dashboardReconciliation.ownershipReassignments,
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
        expiresInHours: clampExpiryHours(expiresInHours, PASSWORD_RESET_ADMIN_DEFAULT_EXPIRY_HOURS),
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
