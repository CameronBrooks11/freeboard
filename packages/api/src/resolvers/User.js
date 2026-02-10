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
import {
  createAuthToken,
  ensureLimitOfUsersIsNotReached,
  ensureThatUserIsAdministrator,
  ensureThatUserIsLogged,
  getUser,
} from "../auth.js";
import { isStrongPassword, isValidEmail } from "../validators.js";

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

      const sortCriteria = { admin: "desc", registrationDate: "asc" };
      return User.find().sort(sortCriteria).lean();
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

      if (!isValidEmail(email)) {
        throw createGraphQLError("The email is not valid");
      }

      if (!isStrongPassword(password)) {
        throw createGraphQLError("The password is not secure enough");
      }

      const registeredUsersCount = await User.find().estimatedDocumentCount();

      ensureLimitOfUsersIsNotReached(registeredUsersCount);

      const isAnEmailAlreadyRegistered = await User.findOne({ email }).lean();

      if (isAnEmailAlreadyRegistered) {
        throw createGraphQLError("Data provided is not valid");
      }

      await new User({ email, password }).save();

      const user = await User.findOne({ email }).lean();

      return {
        token: createAuthToken(user.email, user.admin, user.active, user.uuid),
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
    authUser: async (parent, { email, password }) => {
      if (!email || !password) {
        throw createGraphQLError("Invalid credentials");
      }

      const user = await User.findOne({ email, active: true }).lean();

      if (!user) {
        throw createGraphQLError("User not found or login not allowed");
      }

      const isCorrectPassword = await bcrypt.compare(password, user.password);

      if (!isCorrectPassword) {
        throw createGraphQLError("Invalid credentials");
      }

      await User.findOneAndUpdate(
        { email },
        { lastLogin: new Date().toISOString() },
        { new: true }
      ).lean();

      return {
        token: createAuthToken(user.email, user.admin, user.active, user._id),
      };
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

      return User.deleteOne({ uuid: user.uuid });
    },
  },
};
