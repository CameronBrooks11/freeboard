/**
 * @module index
 * @description Entry point for the Freeboard API server.
 *  - Establishes MongoDB connection
 *  - Ensures default admin user creation
 *  - Sets DNS result order to IPv4 first to avoid IPv6 localhost issues
 *  - Sets up GraphQL Yoga server with SSE support
 *  - Starts HTTP server on configured host and port
 */

import { createServer } from "http";
import { createYoga } from "graphql-yoga";
import mongoose from "mongoose";
import { useGraphQLSSE } from "@graphql-yoga/plugin-graphql-sse";

import schema from "./gql.js";
import { setContext } from "./context.js";
import { config } from "./config.js";
import User from "./models/User.js";

import dns from "dns";

dns.setDefaultResultOrder?.("ipv4first");

/**
 * Connect to MongoDB and fail fast on startup errors.
 */
const connectToMongo = async () => {
  let attempts = 0;
  let connected = false;
  while (!connected) {
    attempts += 1;
    try {
      await mongoose.connect(config.mongoUrl, {
        serverSelectionTimeoutMS: 30000,
      });
      console.info(`MongoDB connected on ${config.mongoUrl}`);
      connected = true;
    } catch (error) {
      console.error(
        `MongoDB connection attempt ${attempts} failed. Retrying in 2s...`
      );
      console.error(error?.message || error);
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }
};

/**
 * Create default admin user on startup if enabled.
 */
const ensureAdminUser = async () => {
  if (!config.createAdmin) {
    return;
  }

  console.log("Admin creation is enabled. Checking for existing admin...");
  const admin = await User.findOne({ email: config.adminEmail });

  if (admin) {
    console.log(`Admin user already exists: ${config.adminEmail}`);
    return;
  }

  console.log(
    `No admin found with email '${config.adminEmail}'. Creating one now...`
  );
  await new User({
    email: config.adminEmail,
    password: config.adminPassword,
    admin: true,
    active: true,
  }).save();
  console.log(`Admin user created: ${config.adminEmail}`);
};

/**
 * A Node.js HTTP server instance.
 * @typedef {Object} HTTPServer
 */

/**
 * HTTP server wrapping GraphQL Yoga instance.
 * @type {HTTPServer}
 */
const server = createServer(
  createYoga({
    landingPage: false,
    schema,
    context: setContext,
    plugins: [useGraphQLSSE()],
  })
);

const startServer = async () => {
  try {
    await connectToMongo();
    await ensureAdminUser();

    // Start HTTP server on configured host and port
    server.listen(config.port, config.host, () => {
      const printableHost =
        config.host === "0.0.0.0" || config.host === "::"
          ? "127.0.0.1"
          : config.host;
      console.info(
        `Server is running on http://${printableHost}:${config.port}/graphql`
      );
    });
  } catch (error) {
    console.error("API startup failed", error);
  }
};

await startServer();
