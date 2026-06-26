import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { createPinia, setActivePinia } from "pinia";

// Minimal browser stubs for the store's asset/theme side-effects on the valid path.
const installBrowserStubs = () => {
  const previousWindow = globalThis.window;
  const previousDocument = globalThis.document;

  globalThis.window = {
    matchMedia() {
      return { matches: false };
    },
    addEventListener() {},
    removeEventListener() {},
  };

  const rootAttributes = {};
  globalThis.document = {
    documentElement: {
      style: {},
      setAttribute(name, value) {
        rootAttributes[name] = String(value);
      },
      getAttribute(name) {
        return rootAttributes[name] ?? null;
      },
      removeAttribute(name) {
        delete rootAttributes[name];
      },
    },
    createElement() {
      return { setAttribute() {}, appendChild() {}, remove() {}, style: {} };
    },
    head: { appendChild() {} },
    body: { appendChild() {}, removeChild() {} },
    getElementsByTagName() {
      return [{ appendChild() {} }];
    },
  };

  return () => {
    globalThis.window = previousWindow;
    globalThis.document = previousDocument;
  };
};

const validDoc = (overrides = {}) => ({
  schemaVersion: 1,
  title: "Valid",
  columns: 3,
  width: "md",
  settings: { theme: "auto" },
  datasources: [],
  panes: [],
  ...overrides,
});

let restoreBrowserStubs = null;

beforeEach(() => {
  setActivePinia(createPinia());
  restoreBrowserStubs = installBrowserStubs();
});

afterEach(() => {
  restoreBrowserStubs?.();
  restoreBrowserStubs = null;
});

test("loadDashboardDocument loads a valid document and reports valid", async () => {
  const { useDashboardStore } = await import("../src/stores/dashboard.js");
  const store = useDashboardStore();

  const result = await store.loadDashboardDocument(validDoc({ title: "Loaded" }));

  assert.equal(result.valid, true, JSON.stringify(result.errors));
  assert.equal(store.dashboard.title, "Loaded");
  assert.equal(store.isSaved, false);
});

test("an invalid import mutates no store state (atomic)", async () => {
  const { useDashboardStore } = await import("../src/stores/dashboard.js");
  const store = useDashboardStore();

  // Establish a known-good loaded state.
  await store.loadDashboardDocument(validDoc({ title: "KEEP" }));
  const keptDashboard = store.dashboard;
  store.isSaved = true; // sentinel: pretend it is a saved record
  store.isEditing = true;
  store.showLoadingIndicator = false;

  // Structurally invalid (title must be a string).
  const result = await store.loadDashboardDocument(validDoc({ title: 123 }));

  assert.equal(result.valid, false);
  assert.ok(
    result.errors.some((issue) => issue.code.startsWith("schema.")),
    "reports a structural error",
  );
  assert.equal(result.document, undefined, "no document on invalid result");

  // Nothing changed.
  assert.equal(store.dashboard, keptDashboard, "dashboard instance not replaced");
  assert.equal(store.dashboard.title, "KEEP");
  assert.equal(store.isSaved, true);
  assert.equal(store.isEditing, true);
  assert.equal(store.showLoadingIndicator, false);
});

test("a non-object import is rejected atomically without throwing", async () => {
  const { useDashboardStore } = await import("../src/stores/dashboard.js");
  const store = useDashboardStore();

  await store.loadDashboardDocument(validDoc({ title: "KEEP" }));
  const keptTitle = store.dashboard.title;

  const result = await store.loadDashboardDocument("not a dashboard");

  assert.equal(result.valid, false);
  assert.equal(result.errors[0].code, "input.notObject");
  assert.equal(store.dashboard.title, keptTitle);
});
