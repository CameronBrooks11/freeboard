import {
  rmSync,
  mkdirSync,
  cpSync,
  existsSync,
  readdirSync,
  writeFileSync,
  readFileSync,
} from "fs";
import { dirname, join } from "path";

/**
 * Small fs helpers
 */
const ensureDir = (p) => mkdirSync(p, { recursive: true });
const readText = (p) => readFileSync(p, "utf8");
const writeText = (p, s) => {
  ensureDir(dirname(p));
  writeFileSync(p, s);
};

/**
 * Strict template loader. Throws with a helpful message if missing.
 */
const requireText = (p, name) => {
  if (!existsSync(p)) {
    throw new Error(`Missing required template: ${name} at ${p}`);
  }
  return readText(p);
};

/**
 * Paths
 */
const DOCS = "docs";
const AUTO = join(DOCS, "auto");
const DEV = join(DOCS, "dev");
const PUBLIC = join(DOCS, "public");
const PUBLIC_DEV = join(PUBLIC, "dev");
const TEMPLATES = join(DOCS, "_templates");

const PATH = {
  // roots
  AUTO,
  DEV,
  PUBLIC_DEV,

  // auto
  AUTO_API_HTML: join(AUTO, "api"),
  AUTO_API_MD: join(AUTO, "api-md"),
  AUTO_GRAPHQL: join(AUTO, "graphql"),
  AUTO_COMPONENTS: join(AUTO, "components"),

  // dev
  DEV_API: join(DEV, "api"),
  DEV_GRAPHQL: join(DEV, "graphql"),
  DEV_COMPONENTS: join(DEV, "components"),

  // public
  PUBLIC_DEV_API: join(PUBLIC_DEV, "api"),
  PUBLIC_DEV_GRAPHQL: join(PUBLIC_DEV, "graphql"),
  PUBLIC_DEMO: join(PUBLIC, "demo"),

  // templates
  TPL_GRAPHQL_INDEX: join(TEMPLATES, "graphql-index.md"),
  TPL_API_INDEX: join(TEMPLATES, "api-index.md"),
  TPL_DEMO_404: join(TEMPLATES, "demo-404.html"),

  // files
  GRAPHQL_SCHEMA: join(AUTO, "graphql", "schema.graphql"),
};

/**
 * Setup clean target structure
 */
rmSync(PUBLIC_DEV, { recursive: true, force: true });

ensureDir(PATH.PUBLIC_DEV_API);
ensureDir(PATH.PUBLIC_DEV_GRAPHQL);
ensureDir(PATH.DEV_COMPONENTS);
ensureDir(PATH.DEV_GRAPHQL);
ensureDir(PATH.DEV_API);

/**
 * 1) API (HTML theme) → public passthrough
 */
if (existsSync(PATH.AUTO_API_HTML)) {
  cpSync(PATH.AUTO_API_HTML, PATH.PUBLIC_DEV_API, { recursive: true });
}

/**
 * 2) GraphQL: copy raw and build pretty page
 */
if (existsSync(PATH.AUTO_GRAPHQL)) {
  // raw schema for download
  cpSync(PATH.AUTO_GRAPHQL, PATH.PUBLIC_DEV_GRAPHQL, { recursive: true });

  const schemaPath = PATH.GRAPHQL_SCHEMA;
  const gqlTplPath = PATH.TPL_GRAPHQL_INDEX;

  if (existsSync(schemaPath)) {
    const schema = readText(schemaPath);
    const page = requireText(gqlTplPath, "GraphQL index").replace(
      "{{SCHEMA_CODE}}",
      schema
    );
    writeText(join(PATH.DEV_GRAPHQL, "index.md"), page);
  } else {
    // explicit message if schema wasn't generated
    writeText(
      join(PATH.DEV_GRAPHQL, "index.md"),
      `# GraphQL Schema

_Schema not found. It should be generated at \`docs/auto/graphql/schema.graphql\` during the docs build._
`
    );
  }
}

/**
 * 3) Components: copy and index
 */
if (existsSync(PATH.AUTO_COMPONENTS)) {
  cpSync(PATH.AUTO_COMPONENTS, PATH.DEV_COMPONENTS, { recursive: true });
}

// components index
{
  const compDir = PATH.DEV_COMPONENTS;
  const items = existsSync(compDir)
    ? readdirSync(compDir)
        .filter((f) => f.endsWith(".md"))
        .sort()
    : [];

  const list = items.length
    ? items
        .map(
          (f) =>
            `- [${f.replace(".md", "")}](/dev/components/${f.replace(
              ".md",
              ""
            )})`
        )
        .join("\n")
    : "_No components found._";

  writeText(
    join(compDir, "index.md"),
    ["# Components", "", list, ""].join("\n")
  );
}

/**
 * 4) API (Markdown) for VitePress
 */
if (existsSync(PATH.AUTO_API_MD)) {
  cpSync(PATH.AUTO_API_MD, PATH.DEV_API, { recursive: true });

  const apiIndex = requireText(PATH.TPL_API_INDEX, "API index");
  writeText(join(PATH.DEV_API, "index.md"), apiIndex);
} else {
  writeText(
    join(PATH.DEV_API, "index.md"),
    "# API Reference\n\n_No API docs generated._\n"
  );
}

/**
 * 5) Demo SPA fallback (404)
 */
{
  const html = requireText(PATH.TPL_DEMO_404, "Demo 404");
  ensureDir(PATH.PUBLIC_DEMO);
  writeText(join(PATH.PUBLIC_DEMO, "404.html"), html);
}

console.log(
  "✅ Staged docs (API/GraphQL/components), generated indexes, and copied demo 404."
);
