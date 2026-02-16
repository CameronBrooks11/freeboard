import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";

import { BarChartWidget, normalizeBarChartRows } from "../src/widgets/BarChartWidget.js";

const createFakeElement = (tagName = "div") => {
  const element = {
    tagName: String(tagName).toUpperCase(),
    style: {},
    dataset: {},
    children: [],
    textContent: "",
    clientWidth: 320,
    clientHeight: 180,
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

  if (element.tagName === "CANVAS") {
    element.getContext = () => ({
      clearRect() {},
      setTransform() {},
      beginPath() {},
      moveTo() {},
      lineTo() {},
      stroke() {},
      fillRect() {},
      fillText() {},
    });
  }

  return element;
};

const originalDocument = globalThis.document;
const originalWindow = globalThis.window;

beforeEach(() => {
  globalThis.document = {
    createElement(tagName) {
      return createFakeElement(tagName);
    },
  };
  globalThis.window = {
    devicePixelRatio: 1,
  };
});

afterEach(() => {
  globalThis.document = originalDocument;
  globalThis.window = originalWindow;
});

test("normalizeBarChartRows supports explicit multi-series fields and clamps negatives", () => {
  const normalized = normalizeBarChartRows(
    [
      { label: "Line A", cpu: 34, mem: 52 },
      { label: "Line B", cpu: -2, mem: "bad" },
    ],
    {
      labelField: "label",
      seriesFields: "cpu, mem",
    },
  );

  assert.deepEqual(normalized.labels, ["Line A", "Line B"]);
  assert.deepEqual(normalized.seriesKeys, ["cpu", "mem"]);
  assert.deepEqual(normalized.data, [
    [34, 52],
    [0, 0],
  ]);
  assert.equal(normalized.maxValue, 52);
});

test("normalizeBarChartRows falls back to single-series value field", () => {
  const normalized = normalizeBarChartRows(
    [
      { name: "A", value: 1.5 },
      { name: "B", value: 2.25 },
    ],
    {
      labelField: "name",
      valueField: "value",
    },
  );

  assert.deepEqual(normalized.labels, ["A", "B"]);
  assert.deepEqual(normalized.seriesKeys, ["value"]);
  assert.deepEqual(normalized.data, [[1.5], [2.25]]);
  assert.equal(normalized.maxValue, 2.25);
});

test("BarChartWidget computes preferred rows for horizontal orientation", () => {
  const widget = new BarChartWidget({
    valuePath: "datasources.metrics.rows",
    orientation: "horizontal",
  });

  widget.processDatasourceUpdate(
    { id: "metrics", title: "Metrics" },
    {
      snapshot: {
        datasources: {
          metrics: {
            rows: [
              { label: "a", value: 1 },
              { label: "b", value: 2 },
              { label: "c", value: 3 },
              { label: "d", value: 4 },
              { label: "e", value: 5 },
            ],
          },
        },
      },
    },
  );

  assert.equal(widget.getPreferredRows(), 3);
});
