import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { createPinia, setActivePinia } from "pinia";

import {
  EMBED_DOCUMENT_MESSAGE_TYPE,
  isEmbedOriginAllowed,
  parseEmbedDocumentMessage,
} from "../src/runtime/embed.js";

const installBrowserStubs = () => {
  const previous = { window: globalThis.window, document: globalThis.document };

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
    Object.assign(globalThis, previous);
  };
};

const validDoc = (overrides = {}) => ({
  schemaVersion: 1,
  title: "Embed",
  columns: 3,
  width: "md",
  settings: { theme: "auto" },
  datasources: [],
  panes: [],
  ...overrides,
});

// --- pure helpers ---

test("isEmbedOriginAllowed: empty allowlist accepts any origin", () => {
  assert.equal(isEmbedOriginAllowed("https://anything.example", []), true);
});

test("isEmbedOriginAllowed: wildcard accepts any origin", () => {
  assert.equal(isEmbedOriginAllowed("https://anything.example", ["*"]), true);
});

test("isEmbedOriginAllowed: a configured allowlist admits only listed origins", () => {
  assert.equal(isEmbedOriginAllowed("https://ok.example", ["https://ok.example"]), true);
  assert.equal(isEmbedOriginAllowed("https://evil.example", ["https://ok.example"]), false);
});

test("parseEmbedDocumentMessage: only a well-formed envelope parses", () => {
  assert.deepEqual(
    parseEmbedDocumentMessage({ type: EMBED_DOCUMENT_MESSAGE_TYPE, document: { a: 1 } }),
    {
      document: { a: 1 },
    },
  );
  assert.equal(parseEmbedDocumentMessage({ type: "other", document: {} }), null);
  assert.equal(parseEmbedDocumentMessage("nope"), null);
  assert.equal(parseEmbedDocumentMessage(null), null);
});

// --- store integration (default empty allowlist = accept any) ---

let restoreBrowserStubs = null;

beforeEach(() => {
  setActivePinia(createPinia());
  restoreBrowserStubs = installBrowserStubs();
});

afterEach(() => {
  restoreBrowserStubs?.();
  restoreBrowserStubs = null;
});

test("loadEmbeddedDocument hydrates a valid injected document", async () => {
  const { useDashboardStore } = await import("../src/stores/dashboard.js");
  const store = useDashboardStore();

  await store.loadEmbeddedDocument({
    type: EMBED_DOCUMENT_MESSAGE_TYPE,
    document: validDoc({ title: "Injected" }),
  });

  assert.equal(store.dashboard.title, "Injected");
  assert.equal(store.isSaved, false);
});

test("loadEmbeddedDocument ignores a non-embed message without mutating state", async () => {
  const { useDashboardStore } = await import("../src/stores/dashboard.js");
  const store = useDashboardStore();

  await store.loadDashboardDocument(validDoc({ title: "KEEP" }));
  const kept = store.dashboard;

  await store.loadEmbeddedDocument({
    type: "something-else",
    document: validDoc({ title: "Nope" }),
  });

  assert.equal(store.dashboard, kept);
  assert.equal(store.dashboard.title, "KEEP");
});

test("loadEmbeddedDocument rejects an invalid injected document without mutating state", async () => {
  const { useDashboardStore } = await import("../src/stores/dashboard.js");
  const store = useDashboardStore();

  await store.loadDashboardDocument(validDoc({ title: "KEEP" }));
  const kept = store.dashboard;

  await store.loadEmbeddedDocument({
    type: EMBED_DOCUMENT_MESSAGE_TYPE,
    document: validDoc({ columns: 1 }), // columns < 3 => invalid
  });

  assert.equal(store.dashboard, kept);
  assert.equal(store.dashboard.title, "KEEP");
});
