import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { createPinia, setActivePinia } from "pinia";

import { useAuthStore } from "../src/stores/auth.js";

const encodeToken = (payload) => {
  const segment = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `header.${segment}.signature`;
};

const installBrowserStubs = () => {
  const previousWindow = globalThis.window;
  const previousDocument = globalThis.document;
  const previousHistory = globalThis.history;
  const previousLocation = globalThis.location;

  const location = {
    pathname: "/",
    search: "",
    hash: "",
    href: "http://localhost/",
    host: "localhost",
    hostname: "localhost",
    origin: "http://localhost",
    protocol: "http:",
  };

  const history = {
    state: null,
    pushState() {
      return undefined;
    },
    replaceState() {
      return undefined;
    },
  };

  globalThis.window = {
    location,
    history,
    matchMedia() {
      return { matches: false };
    },
    addEventListener() {
      return undefined;
    },
    removeEventListener() {
      return undefined;
    },
  };

  const rootAttributes = {};
  const documentElement = {
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
  };

  globalThis.document = {
    documentElement,
    querySelector() {
      return null;
    },
    createElement() {
      return {
        setAttribute() {
          return undefined;
        },
        appendChild() {
          return undefined;
        },
        remove() {
          return undefined;
        },
        style: {},
      };
    },
    addEventListener() {
      return undefined;
    },
    removeEventListener() {
      return undefined;
    },
    head: {
      appendChild() {
        return undefined;
      },
    },
    body: {
      className: "",
      appendChild() {
        return undefined;
      },
      removeChild() {
        return undefined;
      },
    },
    getElementsByTagName() {
      return [
        {
          appendChild() {
            return undefined;
          },
        },
      ];
    },
  };

  globalThis.history = history;
  globalThis.location = location;

  return () => {
    globalThis.window = previousWindow;
    globalThis.document = previousDocument;
    globalThis.history = previousHistory;
    globalThis.location = previousLocation;
  };
};

let restoreBrowserStubs = null;

beforeEach(() => {
  setActivePinia(createPinia());
  restoreBrowserStubs = installBrowserStubs();
});

afterEach(() => {
  restoreBrowserStubs?.();
  restoreBrowserStubs = null;
});

test("dashboard store syncs edit mode based on auth role and dashboard ACL", async () => {
  const { useDashboardStore } = await import("../src/stores/dashboard.js");

  const authStore = useAuthStore();
  const dashboardStore = useDashboardStore();

  authStore.login(
    encodeToken({
      _id: "editor-1",
      email: "editor@example.com",
      role: "editor",
      active: true,
    }),
  );

  dashboardStore.isSaved = true;
  dashboardStore.dashboard.canEdit = false;
  dashboardStore.syncEditingPermissions();

  assert.equal(dashboardStore.allowEdit, false);
  assert.equal(dashboardStore.isEditing, false);

  dashboardStore.dashboard.canEdit = true;
  dashboardStore.syncEditingPermissions();

  assert.equal(dashboardStore.allowEdit, true);
  assert.equal(dashboardStore.isEditing, true);
});

test("dashboard store saveDashboard enforces publish policy on create", async () => {
  const { useDashboardStore } = await import("../src/stores/dashboard.js");

  const authStore = useAuthStore();
  const dashboardStore = useDashboardStore();

  authStore.login(
    encodeToken({
      _id: "editor-2",
      email: "editor@example.com",
      role: "editor",
      active: true,
    }),
  );
  authStore.setPublicAuthPolicy({ editorCanPublish: false });

  dashboardStore.isSaved = false;

  let receivedCreatePayload = null;

  const createDashboard = async ({ dashboard }) => {
    receivedCreatePayload = dashboard;
    return {
      data: {
        createDashboard: {
          _id: "dash-1",
          visibility: dashboard.visibility,
          shareToken: null,
          shareTokenVersion: 0,
          canEdit: true,
          canManageSharing: true,
        },
      },
    };
  };

  const updateDashboard = async () => {
    throw new Error("updateDashboard should not be called for unsaved dashboards");
  };

  const savedDashboardId = await dashboardStore.saveDashboard(
    null,
    {
      title: "Main",
      visibility: "public",
      settings: {},
    },
    createDashboard,
    updateDashboard,
  );

  assert.equal(receivedCreatePayload?.visibility, "private");
  assert.equal(dashboardStore.isSaved, true);
  assert.equal(dashboardStore.dashboard._id, "dash-1");
  assert.equal(savedDashboardId, "dash-1");
});

test("dashboard store blocks mobile editing for sm width unless allowMobileEdit is enabled", async () => {
  const { useDashboardStore } = await import("../src/stores/dashboard.js");

  const authStore = useAuthStore();
  const dashboardStore = useDashboardStore();

  authStore.login(
    encodeToken({
      _id: "editor-mobile-1",
      email: "editor@example.com",
      role: "editor",
      active: true,
    }),
  );

  globalThis.window.matchMedia = () => ({ matches: true });

  dashboardStore.dashboard.width = "sm";
  dashboardStore.dashboard.settings.allowMobileEdit = false;

  dashboardStore.setEditing(true);
  assert.equal(dashboardStore.isEditing, false);

  dashboardStore.dashboard.settings.allowMobileEdit = true;
  dashboardStore.setEditing(true);
  assert.equal(dashboardStore.isEditing, true);
});

test("dashboard store applies curated and fallback themes to document root attributes", async () => {
  const { useDashboardStore } = await import("../src/stores/dashboard.js");
  const dashboardStore = useDashboardStore();
  const root = globalThis.document.documentElement;

  dashboardStore.dashboard.settings.theme = "slate";
  dashboardStore.loadDashboardTheme();
  assert.equal(root.getAttribute("data-theme-selection"), "slate");
  assert.equal(root.getAttribute("data-theme"), "slate");
  assert.equal(root.style.colorScheme, "dark");

  dashboardStore.dashboard.settings.theme = "high-contrast";
  dashboardStore.loadDashboardTheme();
  assert.equal(root.getAttribute("data-theme-selection"), "high-contrast");
  assert.equal(root.getAttribute("data-theme"), "high-contrast");
  assert.equal(root.style.colorScheme, "dark");

  globalThis.window.matchMedia = () => ({ matches: true });
  dashboardStore.dashboard.settings.theme = "invalid-theme";
  dashboardStore.loadDashboardTheme();
  assert.equal(root.getAttribute("data-theme-selection"), "auto");
  assert.equal(root.getAttribute("data-theme"), "dark");
  assert.equal(root.style.colorScheme, "dark");
});
