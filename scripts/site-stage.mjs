/**
 * @file Site staging script.
 * @description Stages generated API/GraphQL/component docs into VitePress paths.
 */

import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";

const HELP_FLAGS = new Set(["--help", "-h"]);
const LOG_PREFIX = "[site-stage]";

const printUsage = () => {
  console.log("Usage: npm run site:stage");
  console.log("");
  console.log("Stages generated docs assets into docs/dev and docs/public/dev.");
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

const ensureDir = (path) => mkdirSync(path, { recursive: true });

const readText = (path) => readFileSync(path, "utf8");

const writeText = (path, content) => {
  ensureDir(dirname(path));
  writeFileSync(path, content);
};

const requireText = (path, name) => {
  if (!existsSync(path)) {
    throw new Error(`Missing required template: ${name} at ${path}`);
  }
  return readText(path);
};

const DOCS = "docs";
const AUTO = join(DOCS, "auto");
const DEV = join(DOCS, "dev");
const PUBLIC = join(DOCS, "public");
const PUBLIC_DEV = join(PUBLIC, "dev");
const TEMPLATES = join(DOCS, "_templates");

const PATH = {
  AUTO,
  DEV,
  PUBLIC_DEV,
  AUTO_API_HTML: join(AUTO, "api"),
  AUTO_API_MD: join(AUTO, "api-md"),
  AUTO_GRAPHQL: join(AUTO, "graphql"),
  AUTO_COMPONENTS: join(AUTO, "components"),
  DEV_API: join(DEV, "api"),
  DEV_GRAPHQL: join(DEV, "graphql"),
  DEV_COMPONENTS: join(DEV, "components"),
  PUBLIC_DEV_API: join(PUBLIC_DEV, "api"),
  PUBLIC_DEV_GRAPHQL: join(PUBLIC_DEV, "graphql"),
  PUBLIC_DEMO: join(PUBLIC, "demo"),
  TPL_GRAPHQL_INDEX: join(TEMPLATES, "graphql-index.md"),
  TPL_API_INDEX: join(TEMPLATES, "api-index.md"),
  TPL_DEMO_404: join(TEMPLATES, "demo-404.html"),
  GRAPHQL_SCHEMA: join(AUTO, "graphql", "schema.graphql"),
};

const stageDocs = () => {
  rmSync(PUBLIC_DEV, { recursive: true, force: true });

  ensureDir(PATH.PUBLIC_DEV_API);
  ensureDir(PATH.PUBLIC_DEV_GRAPHQL);
  ensureDir(PATH.DEV_COMPONENTS);
  ensureDir(PATH.DEV_GRAPHQL);
  ensureDir(PATH.DEV_API);

  if (existsSync(PATH.AUTO_API_HTML)) {
    cpSync(PATH.AUTO_API_HTML, PATH.PUBLIC_DEV_API, { recursive: true });
  }

  if (existsSync(PATH.AUTO_GRAPHQL)) {
    cpSync(PATH.AUTO_GRAPHQL, PATH.PUBLIC_DEV_GRAPHQL, { recursive: true });

    const schemaPath = PATH.GRAPHQL_SCHEMA;
    const gqlTplPath = PATH.TPL_GRAPHQL_INDEX;

    if (existsSync(schemaPath)) {
      const schema = readText(schemaPath);
      const page = requireText(gqlTplPath, "GraphQL index").replace("{{SCHEMA_CODE}}", schema);
      writeText(join(PATH.DEV_GRAPHQL, "index.md"), page);
    } else {
      writeText(
        join(PATH.DEV_GRAPHQL, "index.md"),
        "# GraphQL Schema\n\n_Schema not found. It should be generated at `docs/auto/graphql/schema.graphql` during the docs build._\n",
      );
    }
  }

  if (existsSync(PATH.AUTO_COMPONENTS)) {
    cpSync(PATH.AUTO_COMPONENTS, PATH.DEV_COMPONENTS, { recursive: true });
  }

  const componentFiles = existsSync(PATH.DEV_COMPONENTS)
    ? readdirSync(PATH.DEV_COMPONENTS)
        .filter((file) => file.endsWith(".md"))
        .sort()
    : [];

  const componentList = componentFiles.length
    ? componentFiles
        .map((file) => `- [${file.replace(".md", "")}](/dev/components/${file.replace(".md", "")})`)
        .join("\n")
    : "_No components found._";

  writeText(
    join(PATH.DEV_COMPONENTS, "index.md"),
    ["# Components", "", componentList, ""].join("\n"),
  );

  if (existsSync(PATH.AUTO_API_MD)) {
    cpSync(PATH.AUTO_API_MD, PATH.DEV_API, { recursive: true });
    writeText(join(PATH.DEV_API, "index.md"), requireText(PATH.TPL_API_INDEX, "API index"));
  } else {
    writeText(join(PATH.DEV_API, "index.md"), "# API Reference\n\n_No API docs generated._\n");
  }

  const demo404 = requireText(PATH.TPL_DEMO_404, "Demo 404");
  ensureDir(PATH.PUBLIC_DEMO);
  writeText(join(PATH.PUBLIC_DEMO, "404.html"), demo404);
};

try {
  stageDocs();
  console.log(`${LOG_PREFIX} Staged docs and generated indexes successfully.`);
} catch (error) {
  fail("Failed to stage docs output.", error);
}
