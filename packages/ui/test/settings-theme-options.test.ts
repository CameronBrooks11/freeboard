import assert from "node:assert/strict";
import test from "node:test";

import { UI_LOCALE_OPTIONS } from "../src/i18n/catalog.js";
import { UI_LOCALE_AUTO } from "../src/i18n/index.js";
import createSettings from "../src/settings.js";

const installLocalStorageStub = () => {
  const previousWindow = globalThis.window;
  const storage = new Map<string, string>();

  Object.defineProperty(globalThis, "window", {
    configurable: true,
    writable: true,
    value: {
      localStorage: {
        getItem(key: string) {
          return storage.get(key) ?? null;
        },
        setItem(key: string, value: string) {
          storage.set(key, value);
        },
        removeItem(key: string) {
          storage.delete(key);
        },
      },
    },
  });

  return {
    storage,
    restore() {
      Object.defineProperty(globalThis, "window", {
        configurable: true,
        writable: true,
        value: previousWindow,
      });
    },
  };
};

test("settings schema exposes full curated theme option set", () => {
  const fields = createSettings(
    {
      title: "Main",
      columns: 3,
      settings: {
        theme: "auto",
      },
    },
    { allowTrustedExecution: false },
  );

  const themeSection = fields.find((field) => field.name === "theme");
  assert.ok(themeSection);

  const themeField = themeSection.fields.find((field) => field.name === "theme");
  assert.ok(themeField);

  assert.deepEqual(
    themeField.options.map((option) => option.value),
    ["auto", "light", "paper", "dark", "slate", "high-contrast", "colorblind", "amber-night"],
  );
});

test("settings schema exposes locale selector options with auto reset behavior", () => {
  const fields = createSettings(
    {
      title: "Main",
      columns: 3,
      settings: {
        theme: "auto",
      },
    },
    { allowTrustedExecution: false },
  );

  const languageSection = fields.find((field) => field.name === "language");
  assert.ok(languageSection);

  const languageField = languageSection.fields.find((field) => field.name === "uiLocale");
  assert.ok(languageField);

  assert.deepEqual(
    languageField.options.map((option) => option.value),
    [UI_LOCALE_AUTO, ...UI_LOCALE_OPTIONS],
  );
});

test("settings language section reflects persisted locale override when present", () => {
  const runtime = installLocalStorageStub();
  try {
    runtime.storage.set("freeboard.ui.locale", "de");
    const fields = createSettings(
      {
        title: "Main",
        columns: 3,
        settings: {
          theme: "auto",
        },
      },
      { allowTrustedExecution: false },
    );

    const languageSection = fields.find((field) => field.name === "language");
    assert.ok(languageSection);
    assert.equal(languageSection.settings.uiLocale, "de");
  } finally {
    runtime.restore();
  }
});
