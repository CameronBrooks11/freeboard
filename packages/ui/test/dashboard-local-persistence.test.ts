import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { createPinia, setActivePinia } from "pinia";

// Browser stubs for the store's asset/theme side-effects plus an in-memory
// localStorage and a no-op alert (the load/save actions surface failures via alert).
const installBrowserStubs = () => {
  const previous = {
    window: globalThis.window,
    document: globalThis.document,
    localStorage: globalThis.localStorage,
    alert: globalThis.alert,
  };

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

  const cells = new Map();
  globalThis.localStorage = {
    getItem(key) {
      return cells.has(key) ? cells.get(key) : null;
    },
    setItem(key, value) {
      cells.set(key, String(value));
    },
    removeItem(key) {
      cells.delete(key);
    },
    clear() {
      cells.clear();
    },
    get length() {
      return cells.size;
    },
  };

  globalThis.alert = () => {};

  return () => {
    Object.assign(globalThis, previous);
  };
};

const KEY = "freeboard:dashboard";
const validDoc = (overrides = {}) => ({
  schemaVersion: 1,
  title: "Local",
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

test("saveLocalDashboard writes a portable v1 document (no envelope keys) to one key", async () => {
  const { useDashboardStore } = await import("../src/stores/dashboard.js");
  const store = useDashboardStore();

  await store.loadDashboardDocument(validDoc({ title: "Round" }));
  store.saveLocalDashboard();

  const raw = globalThis.localStorage.getItem(KEY);
  assert.ok(raw, "wrote to the local key");
  const parsed = JSON.parse(raw);
  assert.equal(parsed.title, "Round");
  assert.equal(parsed.schemaVersion, 1);
  for (const envelopeKey of ["_id", "user", "visibility", "shareToken", "acl", "canEdit"]) {
    assert.ok(!(envelopeKey in parsed), `no envelope key '${envelopeKey}'`);
  }

  // Saving again overwrites the same key rather than accumulating entries.
  store.dashboard.title = "Round2";
  store.saveLocalDashboard();
  assert.equal(globalThis.localStorage.length, 1, "single key");
  assert.equal(JSON.parse(globalThis.localStorage.getItem(KEY)).title, "Round2");
});

test("loadLocalDashboard hydrates the stored document and stays unsaved", async () => {
  const { useDashboardStore } = await import("../src/stores/dashboard.js");
  const store = useDashboardStore();

  globalThis.localStorage.setItem(KEY, JSON.stringify(validDoc({ title: "Restored" })));
  await store.loadLocalDashboard();

  assert.equal(store.dashboard.title, "Restored");
  assert.equal(store.isSaved, false);
});

test("loadLocalDashboard with no stored key keeps the empty dashboard (no throw)", async () => {
  const { useDashboardStore } = await import("../src/stores/dashboard.js");
  const store = useDashboardStore();

  const before = store.dashboard;
  await store.loadLocalDashboard();
  assert.equal(store.dashboard, before, "dashboard instance untouched when nothing stored");
});

test("loadLocalDashboard rejects an invalid stored document without mutating state", async () => {
  const { useDashboardStore } = await import("../src/stores/dashboard.js");
  const store = useDashboardStore();

  await store.loadDashboardDocument(validDoc({ title: "KEEP" }));
  const kept = store.dashboard;

  globalThis.localStorage.setItem(KEY, JSON.stringify(validDoc({ columns: 1 }))); // columns < 3 => invalid
  await store.loadLocalDashboard();

  assert.equal(store.dashboard, kept, "dashboard not replaced on invalid stored doc");
  assert.equal(store.dashboard.title, "KEEP");
});

test("loadLocalDashboard tolerates corrupt JSON without mutating state", async () => {
  const { useDashboardStore } = await import("../src/stores/dashboard.js");
  const store = useDashboardStore();

  await store.loadDashboardDocument(validDoc({ title: "KEEP" }));
  const kept = store.dashboard;

  globalThis.localStorage.setItem(KEY, "{not valid json");
  await store.loadLocalDashboard();

  assert.equal(store.dashboard, kept);
  assert.equal(store.dashboard.title, "KEEP");
});
