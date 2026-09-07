/**
 * Drift guard between the headless plugin manifest (`@freeboard/core`) and the
 * UI's per-plugin `fields()` form descriptors (deferred from #182 slice 7, #219).
 *
 * The manifest is deliberately NOT a form descriptor: it carries validation and
 * discovery data only, while `fields()` stays the source of truth for rendering.
 * That separation is intentional, so this check is ONE-DIRECTIONAL -- every
 * manifest field must be renderable, but the UI may hold as many presentational
 * fields as it likes. It asserts what the two sides genuinely share:
 *
 *   1. every manifest field name appears in the plugin's `fields()`, so a field
 *      the server validates can never be unrenderable;
 *   2. a manifest `enum` matches the UI control's `options[]` values (compared
 *      through the manifest's `coerce` rule, which folds case for comparison);
 *   3. manifest numeric bounds are not contradicted by the UI -- either by
 *      declared `min`/`max`, or by an option set offering an out-of-range value.
 *
 * Note on (3): a manifest bound whose UI control declares no bound at all is NOT
 * a failure. The UI may legitimately leave a server-side range unenforced in the
 * form, and asserting otherwise would fail on the current tree.
 *
 * Assumes manifest fields are plugin-specific settings, never part of the shared
 * "general" section the form builder injects -- `general.fields` is passed empty
 * below, so a manifest field sourced from there would read as missing.
 */
import { readdir } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { PLUGIN_MANIFEST } from "../packages/core/src/manifest.ts";

const PROJECT_ROOT = process.cwd();
const UI_SRC_ROOT = path.join(PROJECT_ROOT, "packages", "ui", "src");

const PLUGIN_DIRS = [
  { kind: "datasource", dir: "datasources" },
  { kind: "widget", dir: "widgets" },
];

const LOG_PREFIX = "[check-ui-manifest-fields-parity]";

/** Index every UI plugin class that declares a `typeName`, keyed by `kind:typeName`. */
const collectUiPlugins = async () => {
  const plugins = new Map();

  for (const { kind, dir } of PLUGIN_DIRS) {
    const root = path.join(UI_SRC_ROOT, dir);
    const entries = await readdir(root, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith(".ts")) {
        continue;
      }

      const absolutePath = path.join(root, entry.name);
      const module = await import(pathToFileURL(absolutePath).href);
      const pluginClass = Object.values(module).find(
        (value) => typeof value === "function" && typeof value.typeName === "string",
      );

      if (pluginClass) {
        plugins.set(`${kind}:${pluginClass.typeName}`, {
          pluginClass,
          filePath: path.relative(PROJECT_ROOT, absolutePath),
        });
      }
    }
  }

  return plugins;
};

/**
 * Call `fields()` with the minimum viable arguments and flatten the returned
 * sections into a single name -> descriptor map.
 */
const readUiFields = (pluginClass) => {
  const sections = pluginClass.fields({ settings: {} }, {}, { fields: [], settings: {} }, {});
  const descriptors = new Map();

  for (const section of Array.isArray(sections) ? sections : []) {
    for (const field of section?.fields ?? []) {
      if (field?.name) {
        descriptors.set(field.name, field);
      }
    }
  }

  return descriptors;
};

/** Apply the manifest's comparison-only case folding. */
const normalize = (value, coerce) => {
  const text = String(value).trim();
  if (coerce === "upper") return text.toUpperCase();
  if (coerce === "lower") return text.toLowerCase();
  return text;
};

const optionValues = (descriptor) =>
  Array.isArray(descriptor?.options) ? descriptor.options.map((option) => option?.value) : null;

const checkEnum = (manifestField, descriptor) => {
  const values = optionValues(descriptor);
  if (!values) {
    return `manifest declares enum [${manifestField.enum.join(", ")}] but the UI control (type=${
      descriptor.type
    }) offers no options[]`;
  }

  const expected = manifestField.enum.map((value) => normalize(value, manifestField.coerce)).sort();
  const actual = values.map((value) => normalize(value, manifestField.coerce)).sort();

  if (JSON.stringify(expected) !== JSON.stringify(actual)) {
    return `enum mismatch: manifest [${expected.join(", ")}] vs UI options [${actual.join(", ")}]`;
  }

  return null;
};

const checkBounds = (manifestField, descriptor) => {
  const { min, max } = manifestField;
  const problems = [];

  if (typeof descriptor.min === "number" && typeof min === "number" && descriptor.min < min) {
    problems.push(`UI min ${descriptor.min} is below manifest min ${min}`);
  }
  if (typeof descriptor.max === "number" && typeof max === "number" && descriptor.max > max) {
    problems.push(`UI max ${descriptor.max} is above manifest max ${max}`);
  }

  const values = optionValues(descriptor);
  if (values) {
    const outOfRange = values.filter((value) => {
      const numeric = Number(value);
      if (Number.isNaN(numeric)) return false;
      return (
        (typeof min === "number" && numeric < min) || (typeof max === "number" && numeric > max)
      );
    });
    if (outOfRange.length) {
      problems.push(
        `UI offers option(s) [${outOfRange.join(", ")}] outside manifest bounds min=${min} max=${max}`,
      );
    }
  }

  return problems;
};

const main = async () => {
  const uiPlugins = await collectUiPlugins();
  const failures = [];

  for (const entry of PLUGIN_MANIFEST) {
    if (!entry.fields.length) {
      // Nothing centrally validated yet (all core widgets today) -- nothing to drift.
      continue;
    }

    const key = `${entry.kind}:${entry.typeName}`;
    const plugin = uiPlugins.get(key);

    if (!plugin) {
      failures.push(`${key}: manifest declares fields but no UI plugin exports this typeName`);
      continue;
    }

    let descriptors;
    try {
      descriptors = readUiFields(plugin.pluginClass);
    } catch (error) {
      failures.push(`${key} (${plugin.filePath}): fields() threw -> ${error.message}`);
      continue;
    }

    for (const manifestField of entry.fields) {
      const descriptor = descriptors.get(manifestField.name);

      if (!descriptor) {
        failures.push(
          `${key} (${plugin.filePath}): manifest field '${manifestField.name}' has no matching fields() entry`,
        );
        continue;
      }

      if (manifestField.enum) {
        const problem = checkEnum(manifestField, descriptor);
        if (problem) {
          failures.push(`${key}.${manifestField.name}: ${problem}`);
        }
      }

      if (manifestField.min !== undefined || manifestField.max !== undefined) {
        for (const problem of checkBounds(manifestField, descriptor)) {
          failures.push(`${key}.${manifestField.name}: ${problem}`);
        }
      }
    }
  }

  if (failures.length) {
    console.error(`${LOG_PREFIX} manifest/fields parity check failed:\n`);
    failures.forEach((failure) => console.error(`- ${failure}`));
    console.error(
      `\nThe manifest is validation/discovery data; fields() is the form. Keep every validated field renderable, or update the manifest if the field is genuinely gone.`,
    );
    process.exit(1);
  }

  console.log(`${LOG_PREFIX} manifest/fields parity check passed.`);
};

main().catch((error) => {
  console.error(`${LOG_PREFIX} failed to run:`, error);
  process.exit(1);
});
