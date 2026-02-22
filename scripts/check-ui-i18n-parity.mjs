import { DEFAULT_UI_LOCALE, UI_LOCALE_MESSAGES } from "../packages/ui/src/i18n/catalog.ts";

const flattenMessages = (value, prefix = "") => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  const entries = {};
  for (const [key, nestedValue] of Object.entries(value)) {
    const nextKey = prefix ? `${prefix}.${key}` : key;
    if (nestedValue && typeof nestedValue === "object" && !Array.isArray(nestedValue)) {
      Object.assign(entries, flattenMessages(nestedValue, nextKey));
      continue;
    }
    entries[nextKey] = String(nestedValue);
  }
  return entries;
};

const extractPlaceholders = (input) => {
  const matches = String(input || "").match(/\{([a-zA-Z0-9_]+)\}/g) || [];
  return new Set(matches.map((token) => token.replace(/[{}]/g, "")));
};

const toSortedArray = (setLike) => [...setLike].sort((a, b) => a.localeCompare(b));

const run = () => {
  const localeEntries = Object.entries(UI_LOCALE_MESSAGES);
  if (!localeEntries.length) {
    console.error("[check-ui-i18n-parity] no locale messages were found.");
    process.exit(1);
  }

  const baseLocale = DEFAULT_UI_LOCALE;
  const baseMessages = UI_LOCALE_MESSAGES[baseLocale];
  if (!baseMessages) {
    console.error(`[check-ui-i18n-parity] default locale '${baseLocale}' is missing.`);
    process.exit(1);
  }

  const baseFlat = flattenMessages(baseMessages);
  const baseKeys = new Set(Object.keys(baseFlat));
  const failures = [];

  for (const [locale, messages] of localeEntries) {
    if (locale === baseLocale) {
      continue;
    }

    const localeFlat = flattenMessages(messages);
    const localeKeys = new Set(Object.keys(localeFlat));

    const missingKeys = toSortedArray(new Set([...baseKeys].filter((key) => !localeKeys.has(key))));
    const extraKeys = toSortedArray(new Set([...localeKeys].filter((key) => !baseKeys.has(key))));

    if (missingKeys.length) {
      failures.push(
        `${locale}: missing keys (${missingKeys.length}) -> ${missingKeys.slice(0, 25).join(", ")}`,
      );
    }

    if (extraKeys.length) {
      failures.push(
        `${locale}: extra keys (${extraKeys.length}) -> ${extraKeys.slice(0, 25).join(", ")}`,
      );
    }

    for (const key of Object.keys(localeFlat)) {
      if (!(key in baseFlat)) {
        continue;
      }
      const basePlaceholders = extractPlaceholders(baseFlat[key]);
      const localePlaceholders = extractPlaceholders(localeFlat[key]);

      const placeholderMismatch =
        basePlaceholders.size !== localePlaceholders.size ||
        [...basePlaceholders].some((placeholder) => !localePlaceholders.has(placeholder));

      if (!placeholderMismatch) {
        continue;
      }

      failures.push(
        `${locale}: placeholder mismatch at '${key}' -> expected [${toSortedArray(basePlaceholders).join(", ")}], got [${toSortedArray(localePlaceholders).join(", ")}]`,
      );
    }
  }

  if (failures.length) {
    console.error("[check-ui-i18n-parity] failures:");
    for (const failure of failures) {
      console.error(`  - ${failure}`);
    }
    process.exit(1);
  }

  console.log(
    `[check-ui-i18n-parity] passed. Default locale '${baseLocale}' key count: ${baseKeys.size}.`,
  );
};

run();
