import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { createPinia, setActivePinia } from "pinia";

import { useAuthStore } from "../src/stores/auth.js";
import { clearRuntimeExecutionMode } from "../src/executionPolicy.js";

const STORAGE_KEY = "freeboard";

const createStorage = () => {
  const data = new Map();
  return {
    getItem(key) {
      return data.has(key) ? data.get(key) : null;
    },
    setItem(key, value) {
      data.set(key, String(value));
    },
    removeItem(key) {
      data.delete(key);
    },
    clear() {
      data.clear();
    },
  };
};

const encodeToken = (payload) => {
  const segment = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `header.${segment}.signature`;
};

const originalSessionStorage = globalThis.sessionStorage;
const originalLocalStorage = globalThis.localStorage;

beforeEach(() => {
  setActivePinia(createPinia());
  globalThis.sessionStorage = createStorage();
  globalThis.localStorage = createStorage();
  clearRuntimeExecutionMode();
});

afterEach(() => {
  clearRuntimeExecutionMode();
  globalThis.sessionStorage = originalSessionStorage;
  globalThis.localStorage = originalLocalStorage;
});

test("auth store hydrates session and enforces role/publish policy gating", () => {
  const store = useAuthStore();

  store.login(
    encodeToken({
      _id: "user-1",
      email: "editor@example.com",
      role: "editor",
      active: true,
    }),
  );

  assert.equal(store.isLoggedIn(), true);
  assert.equal(store.getUserRole(), "editor");
  assert.equal(store.canEditDashboards(), true);
  assert.equal(store.canCurrentUserPublish(), false);

  const executionModeChanged = store.setPublicAuthPolicy({
    editorCanPublish: true,
    executionMode: "trusted",
  });

  assert.equal(executionModeChanged, true);
  assert.equal(store.canCurrentUserPublish(), true);
  assert.equal(store.isTrustedExecutionMode(), true);
});

test("auth store drops invalid token payload during hydration", () => {
  const store = useAuthStore();

  globalThis.sessionStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({ token: "invalid.token.payload" }),
  );
  store.token = "invalid.token.payload";

  assert.equal(store.hydrateFromToken(), false);
  assert.equal(store.token, null);
  assert.equal(store.currentUser, null);
  assert.equal(globalThis.sessionStorage.getItem(STORAGE_KEY), "{}");
});

test("auth store migrates legacy localStorage session token to sessionStorage", () => {
  const store = useAuthStore();
  const token = encodeToken({
    _id: "user-2",
    email: "viewer@example.com",
    role: "viewer",
    active: true,
  });

  globalThis.localStorage.setItem(STORAGE_KEY, JSON.stringify({ token }));

  store.loadSession();
  store.hydrateFromToken();

  assert.equal(store.token, token);
  assert.equal(store.currentUser?.email, "viewer@example.com");
  assert.equal(globalThis.sessionStorage.getItem(STORAGE_KEY), JSON.stringify({ token }));
  assert.equal(globalThis.localStorage.getItem(STORAGE_KEY), null);
});

test("auth store clears malformed persisted session payload", () => {
  const store = useAuthStore();

  globalThis.sessionStorage.setItem(STORAGE_KEY, "{not-json");
  store.loadSession();

  assert.equal(store.token, null);
  assert.equal(store.currentUser, null);
  assert.equal(globalThis.sessionStorage.getItem(STORAGE_KEY), null);
});
