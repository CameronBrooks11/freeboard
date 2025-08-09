import { readdirSync, writeFileSync } from "fs";

const compDir = "docs/dev/components";
const items = readdirSync(compDir)
  .filter((f) => f.endsWith(".md"))
  .sort();

const md = [
  "# Components",
  "",
  ...items.map(
    (f) =>
      `- [${f.replace(".md", "")}](/dev/components/${f.replace(".md", "")})`
  ),
].join("\n");

writeFileSync(`${compDir}/index.md`, md);

console.log("Successfully generated components index.");
