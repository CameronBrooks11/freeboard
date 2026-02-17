import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";

import { StatusListWidget, parseStatusColorsMap } from "../src/widgets/StatusListWidget.js";

const createFakeElement = (tagName = "div") => {
  const element = {
    tagName: String(tagName).toUpperCase(),
    style: {},
    dataset: {},
    children: [],
    textContent: "",
    append(...nodes) {
      this.children.push(...nodes);
    },
    appendChild(node) {
      this.children.push(node);
      return node;
    },
    addEventListener() {},
    remove() {
      this.removed = true;
    },
    setAttribute(name, value) {
      this[name] = value;
    },
  };

  Object.defineProperty(element, "innerHTML", {
    get() {
      return this.__innerHTML || "";
    },
    set(value) {
      this.__innerHTML = String(value);
      this.children = [];
    },
  });

  return element;
};

const originalDocument = globalThis.document;

beforeEach(() => {
  globalThis.document = {
    createElement(tagName) {
      return createFakeElement(tagName);
    },
  };
});

afterEach(() => {
  globalThis.document = originalDocument;
});

test("parseStatusColorsMap merges defaults with object/string values", () => {
  const fromObject = parseStatusColorsMap({ ok: "#00ff00", custom: "#123456" });
  assert.equal(fromObject.ok, "#00ff00");
  assert.equal(fromObject.custom, "#123456");
  assert.equal(fromObject.error, "#ef4444");

  const fromJsonString = parseStatusColorsMap('{"warn":"#ffaa00"}');
  assert.equal(fromJsonString.warn, "#ffaa00");
  assert.equal(fromJsonString.ok, "#16a34a");
});

test("StatusListWidget renders empty state when list binding is missing", () => {
  const widget = new StatusListWidget({
    valuePath: "datasources.ops.items",
  });

  widget.processDatasourceUpdate(
    { id: "ops", title: "Ops" },
    {
      snapshot: {
        datasources: {
          ops: {},
        },
      },
    },
  );

  assert.equal(widget.listElement.children.length, 1);
  assert.equal(widget.listElement.children[0].textContent, "No status items");
});

test("StatusListWidget renders mapped status rows and preferred row count", () => {
  const widget = new StatusListWidget({
    valuePath: "datasources.ops.items",
    labelField: "name",
    valueField: "state.value",
    statusField: "state.status",
    showIcons: true,
  });

  widget.processDatasourceUpdate(
    { id: "ops", title: "Ops" },
    {
      snapshot: {
        datasources: {
          ops: {
            items: [
              { name: "Pump A", state: { value: "Running", status: "ok" } },
              { name: "Pump B", state: { value: "Stopped", status: "error" } },
              { name: "Pump C", state: { value: "N/A", status: "offline" } },
            ],
          },
        },
      },
    },
  );

  assert.equal(widget.listElement.children.length, 3);
  assert.equal(widget.listElement.children[0].children[1].textContent, "Pump A");
  assert.equal(widget.listElement.children[0].children[2].textContent, "Running");
  assert.equal(widget.getPreferredRows(), 4);
});
