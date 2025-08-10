import {
  rmSync,
  mkdirSync,
  cpSync,
  existsSync,
  readdirSync,
  writeFileSync,
  readFileSync,
} from "fs";

// 1) Clean & stage auto docs into site
rmSync("docs/public/dev", { recursive: true, force: true });

mkdirSync("docs/public/dev/api", { recursive: true });
mkdirSync("docs/public/dev/graphql", { recursive: true });
mkdirSync("docs/dev/components", { recursive: true });
mkdirSync("docs/dev/graphql", { recursive: true });

if (existsSync("docs/auto/api")) {
  cpSync("docs/auto/api", "docs/public/dev/api", { recursive: true });
}
if (existsSync("docs/auto/graphql")) {
  // Copy raw schema (so /dev/graphql/schema.graphql is downloadable)
  cpSync("docs/auto/graphql", "docs/public/dev/graphql", { recursive: true });

  // Generate a pretty, syntax-highlighted page at /dev/graphql/
  const schemaPath = "docs/auto/graphql/schema.graphql";
  if (existsSync(schemaPath)) {
    const schema = readFileSync(schemaPath, "utf8");
    const page = `# GraphQL Schema

<a href="schema.graphql" download target="_blank" rel="noopener">Download raw</a>

\`\`\`graphql
${schema}
\`\`\`
`;
    writeFileSync("docs/dev/graphql/index.md", page);
  } else {
    // Fallback page if schema is missing
    writeFileSync(
      "docs/dev/graphql/index.md",
      `# GraphQL Schema

_Schema not found. It should be generated at \`docs/auto/graphql/schema.graphql\` during the docs build._
`
    );
  }
}
if (existsSync("docs/auto/components")) {
  cpSync("docs/auto/components", "docs/dev/components", { recursive: true });
}

// 2) Generate Components index (safe if empty)
const compDir = "docs/dev/components";
let items = [];
if (existsSync(compDir)) {
  items = readdirSync(compDir)
    .filter((f) => f.endsWith(".md"))
    .sort();
}

const md = [
  "# Components",
  "",
  ...(items.length
    ? items.map(
        (f) =>
          `- [${f.replace(".md", "")}](/dev/components/${f.replace(".md", "")})`
      )
    : ["_No components found._"]),
].join("\n");

writeFileSync(`${compDir}/index.md`, md);

console.log(
  "✅ Docs staged, GraphQL page generated, and components index built."
);
