import { defineStore } from "pinia";
import { setRuntimeExecutionMode } from "../executionPolicy.js";

const DEFAULT_PUBLIC_AUTH_POLICY = Object.freeze({
  registrationMode: "disabled",
  registrationDefaultRole: "viewer",
  editorCanPublish: false,
  dashboardDefaultVisibility: "private",
  dashboardPublicListingEnabled: false,
  executionMode: "safe",
  policyEditLock: false,
});

const EDITOR_ROLES = new Set(["editor", "admin"]);
const SETTINGS_STORAGE_KEY = "freeboard";

const getSessionStorage = () => {
  try {
    if (typeof globalThis.sessionStorage !== "undefined") {
      return globalThis.sessionStorage;
    }
  } catch {
    // Ignore storage access failures.
  }
  return null;
};

const getLocalStorage = () => {
  try {
    if (typeof globalThis.localStorage !== "undefined") {
      return globalThis.localStorage;
    }
  } catch {
    // Ignore storage access failures.
  }
  return null;
};

const decodeBase64 = (value: string) => {
  if (typeof globalThis.atob === "function") {
    return globalThis.atob(value);
  }
  if (typeof globalThis.Buffer !== "undefined") {
    return globalThis.Buffer.from(value, "base64").toString("utf8");
  }
  throw new Error("No base64 decoder available");
};

const parseJwtPayload = (token: string | null) => {
  if (!token || typeof token !== "string") {
    return null;
  }

  const payloadSegment = token.split(".")[1];
  if (!payloadSegment) {
    return null;
  }

  const normalizedBase64 = payloadSegment
    .replace(/-/g, "+")
    .replace(/_/g, "/")
    .padEnd(Math.ceil(payloadSegment.length / 4) * 4, "=");

  try {
    const payloadJson = decodeBase64(normalizedBase64);
    return JSON.parse(payloadJson);
  } catch {
    return null;
  }
};

const normalizeRole = (role) => {
  const normalized = String(role || "").toLowerCase();
  if (["viewer", "editor", "admin"].includes(normalized)) {
    return normalized;
  }
  return "viewer";
};

const normalizePublicAuthPolicy = (policy: any = {}) => ({
  registrationMode: ["disabled", "invite", "open"].includes(
    String(policy.registrationMode || "").toLowerCase(),
  )
    ? String(policy.registrationMode).toLowerCase()
    : DEFAULT_PUBLIC_AUTH_POLICY.registrationMode,
  registrationDefaultRole: ["viewer", "editor"].includes(
    String(policy.registrationDefaultRole || "").toLowerCase(),
  )
    ? String(policy.registrationDefaultRole).toLowerCase()
    : DEFAULT_PUBLIC_AUTH_POLICY.registrationDefaultRole,
  editorCanPublish:
    policy.editorCanPublish === undefined
      ? DEFAULT_PUBLIC_AUTH_POLICY.editorCanPublish
      : Boolean(policy.editorCanPublish),
  dashboardDefaultVisibility: ["private", "link", "public"].includes(
    String(policy.dashboardDefaultVisibility || "").toLowerCase(),
  )
    ? String(policy.dashboardDefaultVisibility).toLowerCase()
    : DEFAULT_PUBLIC_AUTH_POLICY.dashboardDefaultVisibility,
  dashboardPublicListingEnabled:
    policy.dashboardPublicListingEnabled === undefined
      ? DEFAULT_PUBLIC_AUTH_POLICY.dashboardPublicListingEnabled
      : Boolean(policy.dashboardPublicListingEnabled),
  executionMode: ["safe", "trusted"].includes(String(policy.executionMode || "").toLowerCase())
    ? String(policy.executionMode).toLowerCase()
    : DEFAULT_PUBLIC_AUTH_POLICY.executionMode,
  policyEditLock:
    policy.policyEditLock === undefined
      ? DEFAULT_PUBLIC_AUTH_POLICY.policyEditLock
      : Boolean(policy.policyEditLock),
});

export const useAuthStore = defineStore("auth", {
  state: () => ({
    token: null,
    currentUser: null,
    publicAuthPolicy: { ...DEFAULT_PUBLIC_AUTH_POLICY },
    runtimeShareToken: null,
  }),

  actions: {
    setPublicAuthPolicy(policy) {
      const previousExecutionMode = this.publicAuthPolicy.executionMode;
      this.publicAuthPolicy = normalizePublicAuthPolicy(policy);
      setRuntimeExecutionMode(this.publicAuthPolicy.executionMode);
      return previousExecutionMode !== this.publicAuthPolicy.executionMode;
    },

    setCurrentUser(user) {
      if (!user) {
        this.currentUser = null;
        return;
      }

      this.currentUser = {
        _id: user._id || null,
        email: user.email || null,
        role: normalizeRole(user.role),
        active: user.active !== false,
      };
    },

    setRuntimeShareToken(shareToken) {
      const normalized = String(shareToken || "").trim();
      this.runtimeShareToken = normalized || null;
    },

    hydrateFromToken() {
      const payload = parseJwtPayload(this.token);
      if (!payload) {
        const hadToken = Boolean(this.token);
        this.token = null;
        this.currentUser = null;
        if (hadToken) {
          this.saveSession();
        }
        return false;
      }

      this.currentUser = {
        _id: payload._id || null,
        email: payload.email || null,
        role: normalizeRole(payload.role || (payload.admin ? "admin" : "viewer")),
        active: payload.active !== false,
      };
      return true;
    },

    getUserRole() {
      return this.currentUser?.role || "viewer";
    },

    isLoggedIn() {
      return Boolean(this.token && this.currentUser && this.currentUser.active !== false);
    },

    isAdmin() {
      return this.isLoggedIn() && this.getUserRole() === "admin";
    },

    canEditDashboards() {
      return this.isLoggedIn() && EDITOR_ROLES.has(this.getUserRole());
    },

    canCurrentUserPublish() {
      if (!this.isLoggedIn()) {
        return false;
      }
      if (this.getUserRole() === "admin") {
        return true;
      }
      return this.getUserRole() === "editor" && this.publicAuthPolicy.editorCanPublish;
    },

    isTrustedExecutionMode() {
      return this.publicAuthPolicy.executionMode === "trusted";
    },

    loadSession() {
      const sessionStorageRef = getSessionStorage();
      const localStorageRef = getLocalStorage();
      const item =
        sessionStorageRef?.getItem(SETTINGS_STORAGE_KEY) ??
        localStorageRef?.getItem(SETTINGS_STORAGE_KEY) ??
        null;

      if (!item) {
        this.token = null;
        this.currentUser = null;
        return;
      }

      try {
        const settings: any = JSON.parse(item);
        this.token = settings.token || null;
      } catch {
        this.token = null;
        this.currentUser = null;
        sessionStorageRef?.removeItem(SETTINGS_STORAGE_KEY);
        localStorageRef?.removeItem(SETTINGS_STORAGE_KEY);
      }

      // Migrate any legacy localStorage session token into sessionStorage.
      if (sessionStorageRef && localStorageRef) {
        const legacyItem = localStorageRef.getItem(SETTINGS_STORAGE_KEY);
        if (legacyItem) {
          sessionStorageRef.setItem(SETTINGS_STORAGE_KEY, legacyItem);
          localStorageRef.removeItem(SETTINGS_STORAGE_KEY);
        }
      }
    },

    saveSession() {
      const settings: Record<string, any> = {};
      if (this.token) {
        settings.token = this.token;
      }
      const serialized = JSON.stringify(settings);
      const sessionStorageRef = getSessionStorage();
      const localStorageRef = getLocalStorage();

      sessionStorageRef?.setItem(SETTINGS_STORAGE_KEY, serialized);
      localStorageRef?.removeItem(SETTINGS_STORAGE_KEY);
    },

    login(token) {
      this.token = token;
      this.hydrateFromToken();
      this.saveSession();
    },

    logout() {
      this.token = null;
      this.currentUser = null;
      this.runtimeShareToken = null;
      this.saveSession();
    },
  },
});

export { DEFAULT_PUBLIC_AUTH_POLICY, normalizePublicAuthPolicy };
