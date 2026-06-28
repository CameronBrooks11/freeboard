import assert from "node:assert/strict";
import test from "node:test";

import { buildProfileSelectOptions } from "../src/datasources/profileOptions.js";

// Issue #223: when a datasource references a profile the editor may not use (so it
// is absent from the usable list), the picker must show it as a disabled "kept"
// option instead of silently falling back to the first option ("None").

const profiles = [
  { _id: "p1", name: "Public A" },
  { _id: "p2", name: "Public B" },
];

test("leads with the placeholder, then one option per usable profile", () => {
  const options = buildProfileSelectOptions("p1", profiles, "form.optionCredentialProfileNone");
  assert.deepEqual(options, [
    { value: "", label: "form.optionCredentialProfileNone" },
    { value: "p1", label: "Public A" },
    { value: "p2", label: "Public B" },
  ]);
});

test("no selection adds no kept option", () => {
  const options = buildProfileSelectOptions("", profiles, "form.optionCredentialProfileNone");
  assert.equal(
    options.some((option) => option.disabled),
    false,
  );
  assert.equal(options.length, profiles.length + 1);
});

test("a stored id NOT in the usable list is appended as a disabled kept option", () => {
  const options = buildProfileSelectOptions(
    "restricted-9",
    profiles,
    "form.optionCredentialProfileNone",
  );
  const kept = options.at(-1);
  assert.deepEqual(kept, {
    value: "restricted-9",
    label: "form.optionProfileRestricted",
    disabled: true,
  });
});

test("a stored id that IS in the usable list adds no kept option", () => {
  const options = buildProfileSelectOptions("p2", profiles, "form.optionCredentialProfileNone");
  assert.equal(
    options.some((option) => option.disabled),
    false,
  );
});

test("non-string / whitespace selected ids are ignored (no kept option)", () => {
  for (const selected of [null, undefined, 42, "   "]) {
    const options = buildProfileSelectOptions(
      selected,
      profiles,
      "form.optionCredentialProfileNone",
    );
    assert.equal(
      options.some((option) => option.disabled),
      false,
    );
  }
});
