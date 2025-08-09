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

mongoose
  .connect(config.mongoUrl, {})
  .then(() => console.log(`MongoDB connected on ${config.mongoUrl}`))
  .catch((err) => console.log(err));

if (config.createAdmin) {
  console.log("Admin creation is enabled. Checking for existing admin...");

  const admin = await User.findOne({ email: config.adminEmail });
  
  if (!admin) {
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
  } else {
    console.log(`Admin user already exists: ${config.adminEmail}`);
  }
}

const server = createServer(
  createYoga({
    landingPage: false,
    schema,
    context: setContext,
    plugins: [useGraphQLSSE()],
  })
);

server.listen(config.port, config.host, () => {
  const printableHost =
    (config.host === "0.0.0.0" || config.host === "::") ? "127.0.0.1" : config.host;
  console.info(`Server is running on http://${printableHost}:${config.port}/graphql`);
});