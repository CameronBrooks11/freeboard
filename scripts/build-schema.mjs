/**
 * @file GraphQL schema build script.
 * @description Builds SDL from API GraphQL schema and writes to docs/auto/graphql/schema.graphql.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { printSchema } from "graphql";

const HELP_FLAGS = new Set(["--help", "-h"]);
const LOG_PREFIX = "[build-schema]";

const printUsage = () => {
  console.log("Usage: npm run docs:generate:graphql");
  console.log("");
  console.log(
    "Reads GraphQLSchema export from packages/api/src/gql.ts and writes SDL to docs/auto/graphql/schema.graphql.",
  );
};

if (process.argv.some((arg) => HELP_FLAGS.has(arg))) {
  printUsage();
  process.exit(0);
}

const fail = (message, error = null) => {
  console.error(`${LOG_PREFIX} ${message}`);
  if (error) {
    console.error(error);
  }
  process.exit(1);
};

const __dirname = dirname(fileURLToPath(import.meta.url));
const schemaModulePath = resolve(__dirname, "../packages/api/src/gql.ts");
const outputPath = resolve(__dirname, "../docs/auto/graphql/schema.graphql");

const main = async () => {
  const schemaModule = await import(pathToFileURL(schemaModulePath).href);
  const schema = schemaModule.default || schemaModule.schema;

  if (!schema || typeof schema.getTypeMap !== "function") {
    throw new Error(
      "packages/api/src/gql.ts must export a GraphQLSchema as default export or named export `schema`.",
    );
  }

  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, printSchema(schema), "utf8");
  console.log(`${LOG_PREFIX} Wrote ${outputPath}`);
};

try {
  await main();
} catch (error) {
  fail("Failed to generate GraphQL schema output.", error);
}
