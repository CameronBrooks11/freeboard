// scripts/site-stage.mjs
import {
  rmSync,
  mkdirSync,
  cpSync,
  existsSync,
  readdirSync,
  writeFileSync,
} from "fs";
import { dirname } from "path";

// 1) Clean & stage auto docs into site
rmSync("docs/public/dev", { recursive: true, force: true });

mkdirSync("docs/public/dev/api", { recursive: true });
mkdirSync("docs/public/dev/graphql", { recursive: true });
mkdirSync("docs/dev/components", { recursive: true });

if (existsSync("docs/auto/api"))
  cpSync("docs/auto/api", "docs/public/dev/api", { recursive: true });
if (existsSync("docs/auto/graphql"))
  cpSync("docs/auto/graphql", "docs/public/dev/graphql", { recursive: true });
if (existsSync("docs/auto/components"))
  cpSync("docs/auto/components", "docs/dev/components", { recursive: true });

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
console.log("✅ Docs staged and components index generated.");
