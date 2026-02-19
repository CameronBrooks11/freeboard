import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";

import {
  TableWidget,
  normalizeTableColumns,
  paginateTableRows,
  resolveTableRowValue,
  sortTableRows,
} from "../src/widgets/TableWidget.js";

const createFakeElement = (tagName = "div") => {
  const element = {
    tagName: String(tagName).toUpperCase(),
    style: {},
    dataset: {},
    children: [],
    textContent: "",
    disabled: false,
    append(...nodes) {
      this.children.push(...nodes);
    },
    appendChild(node) {
      this.children.push(node);
      return node;
    },
    addEventListener(type, handler) {
      if (!this.__listeners) {
        this.__listeners = {};
      }
      this.__listeners[type] = handler;
    },
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

test("resolveTableRowValue supports dot and bracket path notation on row-root context", () => {
  const row = {
    metrics: {
      cpu: {
        usage: 42,
      },
    },
    items: [{ value: "a" }, { value: "b" }],
    meta: {
      "sensor.name": "line-1",
    },
  };

  assert.equal(resolveTableRowValue(row, "metrics.cpu.usage"), 42);
  assert.equal(resolveTableRowValue(row, "items[1].value"), "b");
  assert.equal(resolveTableRowValue(row, "meta['sensor.name']"), "line-1");
  assert.equal(resolveTableRowValue(row, "meta.unknown"), undefined);
});

test("normalizeTableColumns normalizes align/format and auto-builds headers", () => {
  const columns = normalizeTableColumns(
    [
      { field: " name ", align: "RIGHT", format: "NUMBER" },
      { field: "status", header: "Status", align: "center", format: "json" },
    ],
    [],
  );

  assert.deepEqual(columns, [
    {
      field: "name",
      header: "name",
      width: "",
      align: "right",
      format: "number",
    },
    {
      field: "status",
      header: "Status",
      width: "",
      align: "center",
      format: "json",
    },
  ]);
});

test("sortTableRows sorts numeric and textual fields deterministically", () => {
  const rows = [
    { name: "zeta", score: "10" },
    { name: "beta", score: "2" },
    { name: "alpha", score: "1" },
  ];

  const byScoreAsc = sortTableRows(rows, { field: "score", direction: "asc" });
  assert.deepEqual(
    byScoreAsc.map((row) => row.name),
    ["alpha", "beta", "zeta"],
  );

  const byNameDesc = sortTableRows(rows, { field: "name", direction: "desc" });
  assert.deepEqual(
    byNameDesc.map((row) => row.name),
    ["zeta", "beta", "alpha"],
  );
});

test("paginateTableRows clamps current page and supports unpaged mode", () => {
  const rows = [1, 2, 3, 4, 5];

  const paged = paginateTableRows(rows, 2, 99);
  assert.equal(paged.currentPage, 3);
  assert.equal(paged.totalPages, 3);
  assert.deepEqual(paged.rows, [5]);

  const unpaged = paginateTableRows(rows, 0, 3);
  assert.equal(unpaged.currentPage, 1);
  assert.equal(unpaged.totalPages, 1);
  assert.deepEqual(unpaged.rows, rows);
});

test("TableWidget renders paged rows, supports sorting, and adapts to narrow width", () => {
  const widget = new TableWidget({
    valuePath: "datasources.stats.rows",
    rowsPerPage: 2,
    sortable: true,
    compact: false,
    columns: [
      { field: "name", header: "Name" },
      { field: "score", header: "Score", align: "right", format: "integer" },
    ],
  });

  widget.processDatasourceUpdate(
    { id: "stats", title: "Stats" },
    {
      snapshot: {
        datasources: {
          stats: {
            rows: [
              { name: "Gamma", score: 30 },
              { name: "Alpha", score: 10 },
              { name: "Beta", score: 20 },
            ],
          },
        },
      },
    },
  );

  assert.equal(widget.tableBody.children.length, 2);
  assert.equal(widget.getPreferredRows(), 2);

  widget.handleSort("name");
  const sortedFirstRow = widget.tableBody.children[0];
  assert.equal(sortedFirstRow.children[0].textContent, "Alpha");

  widget.onResize({ width: 480, height: 240 });
  assert.equal(widget.tableElement.style.fontSize, "12px");
  assert.equal(widget.scrollWrap.style.overflowX, "auto");
});
