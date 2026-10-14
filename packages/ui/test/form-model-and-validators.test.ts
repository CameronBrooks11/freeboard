import assert from "node:assert/strict";
import test from "node:test";

import { MQTTDatasource } from "../src/datasources/MQTTDatasource.js";
import { resolveFieldModelValue } from "../src/formModel.js";
import { createRangeValidator, validateInteger, validateRequired } from "../src/validators.js";

test("resolveFieldModelValue preserves explicit false model value", () => {
  const value = resolveFieldModelValue(
    {
      name: "enabled",
      model: false,
      default: true,
    },
    { enabled: true },
  );

  assert.equal(value, false);
});

test("resolveFieldModelValue preserves explicit 0 setting value", () => {
  const value = resolveFieldModelValue(
    {
      name: "interval",
      default: 10,
    },
    { interval: 0 },
  );

  assert.equal(value, 0);
});

test("resolveFieldModelValue preserves explicit empty-string setting value", () => {
  const value = resolveFieldModelValue(
    {
      name: "label",
      default: "fallback",
    },
    { label: "" },
  );

  assert.equal(value, "");
});

test("resolveFieldModelValue falls back to default when unset", () => {
  const value = resolveFieldModelValue(
    {
      name: "timeout",
      default: 15,
    },
    {},
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

const rangeError = ({ min, max }: { min?: number; max?: number }) => `range ${min}-${max}`;

test("createRangeValidator rejects values outside the bounds, as the server does", () => {
  const validate = createRangeValidator({ min: 5, max: 3600 }, rangeError);
  for (const value of ["99999", "0", "4", "3601", 4, 3601]) {
    assert.deepEqual(validate(value), { error: "range 5-3600" }, `value ${JSON.stringify(value)}`);
  }
  for (const value of ["5", "60", "3600", 5, 60, 3600]) {
    assert.deepEqual(validate(value), {}, `value ${JSON.stringify(value)}`);
  }
});

test("createRangeValidator reads a blank value as 0, as the server does", () => {
  const validate = createRangeValidator({ min: 5, max: 3600 }, rangeError);
  assert.deepEqual(validate(""), { error: "range 5-3600" });
  assert.deepEqual(validate("   "), { error: "range 5-3600" });
});

test("createRangeValidator lets absent values and non-numbers through to other validators", () => {
  const validate = createRangeValidator({ min: 5, max: 3600 }, rangeError);
  assert.deepEqual(validate(null), {});
  assert.deepEqual(validate(undefined), {});
  assert.deepEqual(validate("abc"), {});
});

test("MQTT keepaliveSeconds form field enforces the server's 5-3600 whole-second range", () => {
  const sections = MQTTDatasource.fields(
    { settings: {} },
    {},
    { name: "general", fields: [], settings: {} },
  ) as Array<{ fields?: unknown[] }>;
  const keepalive = sections
    .flatMap((section) => (Array.isArray(section.fields) ? section.fields : []))
    .find((field) => (field as { name?: string }).name === "keepaliveSeconds") as {
    type?: string;
    min?: number;
    max?: number;
  };
  assert.ok(keepalive, "keepaliveSeconds field is rendered");
  assert.equal(keepalive.type, "integer");
  assert.equal(keepalive.min, 5);
  assert.equal(keepalive.max, 3600);

  const inRange = createRangeValidator(keepalive, rangeError);
  const accepts = (value: unknown) => !validateInteger(value).error && !inRange(value).error;
  for (const value of ["99999", "0", "", "5.5"]) {
    assert.equal(accepts(value), false, `rejects ${JSON.stringify(value)}`);
  }
  for (const value of [60, "60", "5", "3600"]) {
    assert.equal(accepts(value), true, `accepts ${JSON.stringify(value)}`);
  }
});
