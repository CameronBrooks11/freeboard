import { defineStore } from "pinia";
import { setRuntimeExecutionMode } from "../executionPolicy.js";

type PublicAuthPolicy = {
  registrationMode: "disabled" | "invite" | "open";
  registrationDefaultRole: "viewer" | "editor";
  nonAdminCanPublish: boolean;
  dashboardDefaultVisibility: "private" | "link" | "public";
  dashboardPublicListingEnabled: boolean;
  executionMode: "safe" | "trusted";
  policyEditLock: boolean;
};

const DEFAULT_PUBLIC_AUTH_POLICY: PublicAuthPolicy = Object.freeze({
  registrationMode: "disabled",
  registrationDefaultRole: "viewer",
  nonAdminCanPublish: false,
  dashboardDefaultVisibility: "private",
  dashboardPublicListingEnabled: false,
  executionMode: "safe",
  policyEditLock: false,
});

const EDITOR_ROLES = new Set(["editor", "admin"]);
const SETTINGS_STORAGE_KEY = "freeboard";
type UserRole = "viewer" | "editor" | "admin";
type AuthUser = { _id: string | null; email: string | null; role: UserRole; active: boolean };
type AuthStoreState = {
  token: string | null;
  currentUser: AuthUser | null;
  publicAuthPolicy: PublicAuthPolicy;
  runtimeShareToken: string | null;
};

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
  const runtimeGlobal = globalThis as typeof globalThis & {
    Buffer?: { from(value: string, encoding?: string): { toString(encoding?: string): string } };
  };
  if (typeof globalThis.atob === "function") {
    return globalThis.atob(value);
  }
  if (typeof runtimeGlobal.Buffer !== "undefined") {
    return runtimeGlobal.Buffer.from(value, "base64").toString("utf8");
  }
  throw new Error("No base64 decoder available");
};

const parseJwtPayload = (token: string | null): Record<string, unknown> | null => {
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

const normalizeRole = (role: unknown): UserRole => {
  const allowedRoles: UserRole[] = ["viewer", "editor", "admin"];
  const normalized = String(role || "").toLowerCase();
  if (allowedRoles.includes(normalized as UserRole)) {
    return normalized as UserRole;
  }
  return "viewer";
};

const parseUserId = (value: unknown): string | null => {
  return typeof value === "string" ? value : null;
};

const parseUserEmail = (value: unknown): string | null => {
  return typeof value === "string" ? value : null;
};

const normalizePublicAuthPolicy = (policy: Record<string, unknown> = {}): PublicAuthPolicy => ({
  registrationMode:
    String(policy.registrationMode || "").toLowerCase() === "invite"
      ? "invite"
      : String(policy.registrationMode || "").toLowerCase() === "open"
        ? "open"
        : DEFAULT_PUBLIC_AUTH_POLICY.registrationMode,
  registrationDefaultRole:
    String(policy.registrationDefaultRole || "").toLowerCase() === "editor"
      ? "editor"
      : DEFAULT_PUBLIC_AUTH_POLICY.registrationDefaultRole,
  nonAdminCanPublish:
    policy.nonAdminCanPublish === undefined
      ? DEFAULT_PUBLIC_AUTH_POLICY.nonAdminCanPublish
      : Boolean(policy.nonAdminCanPublish),
  dashboardDefaultVisibility:
    String(policy.dashboardDefaultVisibility || "").toLowerCase() === "link"
      ? "link"
      : String(policy.dashboardDefaultVisibility || "").toLowerCase() === "public"
        ? "public"
        : DEFAULT_PUBLIC_AUTH_POLICY.dashboardDefaultVisibility,
  dashboardPublicListingEnabled:
    policy.dashboardPublicListingEnabled === undefined
      ? DEFAULT_PUBLIC_AUTH_POLICY.dashboardPublicListingEnabled
      : Boolean(policy.dashboardPublicListingEnabled),
  executionMode:
    String(policy.executionMode || "").toLowerCase() === "trusted"
      ? "trusted"
      : DEFAULT_PUBLIC_AUTH_POLICY.executionMode,
  policyEditLock:
    policy.policyEditLock === undefined
      ? DEFAULT_PUBLIC_AUTH_POLICY.policyEditLock
      : Boolean(policy.policyEditLock),
});

export const useAuthStore = defineStore("auth", {
  state: (): AuthStoreState => ({
    token: null as string | null,
    currentUser: null as AuthUser | null,
    publicAuthPolicy: { ...DEFAULT_PUBLIC_AUTH_POLICY } as PublicAuthPolicy,
    runtimeShareToken: null as string | null,
  }),

  actions: {
    setPublicAuthPolicy(policy: Record<string, unknown>) {
      const previousExecutionMode = this.publicAuthPolicy.executionMode;
      this.publicAuthPolicy = normalizePublicAuthPolicy(policy);
      setRuntimeExecutionMode(this.publicAuthPolicy.executionMode);
      return previousExecutionMode !== this.publicAuthPolicy.executionMode;
    },

    setCurrentUser(user: Record<string, unknown> | null | undefined) {
      if (!user) {
        this.currentUser = null;
        return;
      }

      this.currentUser = {
        _id: parseUserId(user._id),
        email: parseUserEmail(user.email),
        role: normalizeRole(user.role),
        active: user.active !== false,
      };
    },

    setRuntimeShareToken(shareToken: unknown) {
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
        _id: parseUserId(payload._id),
        email: parseUserEmail(payload.email),
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
      // Mirror the server — a non-admin may publish when the policy allows it,
      // regardless of the global "editor" role (an ACL editor/manager qualifies).
      return this.publicAuthPolicy.nonAdminCanPublish;
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
        const settings = JSON.parse(item) as Record<string, unknown>;
        this.token = settings.token ? String(settings.token) : null;
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
      const settings: Record<string, unknown> = {};
      if (this.token) {
        settings.token = this.token;
      }
      const serialized = JSON.stringify(settings);
      const sessionStorageRef = getSessionStorage();
      const localStorageRef = getLocalStorage();

      sessionStorageRef?.setItem(SETTINGS_STORAGE_KEY, serialized);
      localStorageRef?.removeItem(SETTINGS_STORAGE_KEY);
    },

    login(token: string) {
      this.token = String(token || "");
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
