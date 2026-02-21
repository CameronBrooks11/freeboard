import assert from "node:assert/strict";
import test from "node:test";

import createSettings from "../src/settings.js";

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
    ["auto", "light", "dark", "slate", "high-contrast", "colorblind", "amber-night"],
  );
});
