import assert from "node:assert/strict";
import { test } from "node:test";

import {
  defaultWidgetFields,
  validateWidgetPlugin,
} from "../src/widgets/runtime/plugin.js";

test("defaultWidgetFields returns the general section", () => {
  const general = { name: "general" };
  assert.deepEqual(defaultWidgetFields({}, {}, general), [general]);
});

test("validateWidgetPlugin applies defaults for label and fields", () => {
  const plugin = {
    typeName: "  test-widget  ",
    newInstance: () => {},
  };

  const validated = validateWidgetPlugin(plugin);
  assert.equal(validated.typeName, "test-widget");
  assert.equal(validated.label, "test-widget");
  assert.equal(typeof validated.fields, "function");
});

test("validateWidgetPlugin rejects invalid definitions", () => {
  assert.throws(
    () => validateWidgetPlugin({ typeName: "x" }),
    /requires a 'newInstance' function/
  );
  assert.throws(
    () => validateWidgetPlugin({ newInstance: () => {} }),
    /requires a non-empty string `typeName`/
  );
});
