import assert from "node:assert/strict";
import test from "node:test";

import { resolveFieldModelValue } from "../src/formModel.js";
import { validateRequired } from "../src/validators.js";

test("resolveFieldModelValue preserves explicit false model value", () => {
  const value = resolveFieldModelValue(
    {
      name: "enabled",
      model: { value: false },
      default: true,
    },
    { enabled: true }
  );

  assert.equal(value, false);
});

test("resolveFieldModelValue preserves explicit 0 setting value", () => {
  const value = resolveFieldModelValue(
    {
      name: "interval",
      default: 10,
    },
    { interval: 0 }
  );

  assert.equal(value, 0);
});

test("resolveFieldModelValue preserves explicit empty-string setting value", () => {
  const value = resolveFieldModelValue(
    {
      name: "label",
      default: "fallback",
    },
    { label: "" }
  );

  assert.equal(value, "");
});

test("resolveFieldModelValue falls back to default when unset", () => {
  const value = resolveFieldModelValue(
    {
      name: "timeout",
      default: 15,
    },
    {}
  );

  assert.equal(value, 15);
});

test("validateRequired accepts false and 0", () => {
  assert.deepEqual(validateRequired(false), {});
  assert.deepEqual(validateRequired(0), {});
});

test("validateRequired rejects nullish and empty string", () => {
  assert.deepEqual(validateRequired(null), { error: "This is required." });
  assert.deepEqual(validateRequired(undefined), { error: "This is required." });
  assert.deepEqual(validateRequired(""), { error: "This is required." });
  assert.deepEqual(validateRequired("   "), { error: "This is required." });
});

test("validateRequired enforces non-empty arrays", () => {
  assert.deepEqual(validateRequired([]), { error: "This is required." });
  assert.deepEqual(validateRequired([1]), {});
});

