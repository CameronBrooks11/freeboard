/**
 * @module stores/freeboard
 * @description Pinia store for Freeboard application state, including dashboard data, plugins, and UI actions.
 */

import { defineStore } from "pinia";
import renderComponent from "../render";
import { Dashboard } from "../models/Dashboard";
import router from "../router";
import { usePreferredColorScheme } from "@vueuse/core";
import { validateWidgetPlugin } from "../widgets/runtime/plugin";
import { disposeDashboardAssets } from "../dashboardAssets";
import { normalizeCreateDashboardPayload } from "../auth/publishPolicy";

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

const decodeBase64 = (value) => {
  if (typeof globalThis.atob === "function") {
    return globalThis.atob(value);
  }
  if (typeof globalThis.Buffer !== "undefined") {
    return globalThis.Buffer.from(value, "base64").toString("utf8");
  }
  throw new Error("No base64 decoder available");
};

const parseJwtPayload = (token) => {
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

const normalizePublicAuthPolicy = (policy = {}) => ({
  registrationMode: ["disabled", "invite", "open"].includes(
    String(policy.registrationMode || "").toLowerCase()
  )
    ? String(policy.registrationMode).toLowerCase()
    : DEFAULT_PUBLIC_AUTH_POLICY.registrationMode,
  registrationDefaultRole: ["viewer", "editor"].includes(
    String(policy.registrationDefaultRole || "").toLowerCase()
  )
    ? String(policy.registrationDefaultRole).toLowerCase()
    : DEFAULT_PUBLIC_AUTH_POLICY.registrationDefaultRole,
  editorCanPublish:
    policy.editorCanPublish === undefined
      ? DEFAULT_PUBLIC_AUTH_POLICY.editorCanPublish
      : Boolean(policy.editorCanPublish),
  dashboardDefaultVisibility: ["private", "link", "public"].includes(
    String(policy.dashboardDefaultVisibility || "").toLowerCase()
  )
    ? String(policy.dashboardDefaultVisibility).toLowerCase()
    : DEFAULT_PUBLIC_AUTH_POLICY.dashboardDefaultVisibility,
  dashboardPublicListingEnabled:
    policy.dashboardPublicListingEnabled === undefined
      ? DEFAULT_PUBLIC_AUTH_POLICY.dashboardPublicListingEnabled
      : Boolean(policy.dashboardPublicListingEnabled),
  executionMode: ["safe", "trusted"].includes(
    String(policy.executionMode || "").toLowerCase()
  )
    ? String(policy.executionMode).toLowerCase()
    : DEFAULT_PUBLIC_AUTH_POLICY.executionMode,
  policyEditLock:
    policy.policyEditLock === undefined
      ? DEFAULT_PUBLIC_AUTH_POLICY.policyEditLock
      : Boolean(policy.policyEditLock),
});

export const useFreeboardStore = defineStore("freeboard", {
  /**
   * Initial state of the Freeboard store.
   *
   * @returns {{
   *   isSaved: boolean,
   *   allowEdit: boolean,
   *   isEditing: boolean,
   *   showLoadingIndicator: boolean,
   *   datasourcePlugins: Object<string, any>,
   *   widgetPlugins: Object<string, any>,
   *   authPlugins: Object<string, any>,
   *   dashboard: Dashboard,
   *   assets: Object<string, any>,
   *   token: string|null,
   *   currentUser: Object|null,
   *   publicAuthPolicy: Object
   * }}
   */
  state: () => ({
    isSaved: false,
    allowEdit: false,
    isEditing: false,
    showLoadingIndicator: true,
    datasourcePlugins: {},
    widgetPlugins: {},
    authPlugins: {},
    dashboard: new Dashboard(),
    assets: {},
    token: null,
    currentUser: null,
    publicAuthPolicy: { ...DEFAULT_PUBLIC_AUTH_POLICY },
  }),

  actions: {
    setPublicAuthPolicy(policy) {
      const previousExecutionMode = this.publicAuthPolicy.executionMode;
      this.publicAuthPolicy = normalizePublicAuthPolicy(policy);
      if (
        previousExecutionMode !== this.publicAuthPolicy.executionMode &&
        this.dashboard
      ) {
        this.loadDashboardAssets();
      }
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

    hydrateSessionFromToken() {
      const payload = parseJwtPayload(this.token);
      if (!payload) {
        this.token = null;
        this.currentUser = null;
        return;
      }

      this.currentUser = {
        _id: payload._id || null,
        email: payload.email || null,
        role: normalizeRole(payload.role || (payload.admin ? "admin" : "viewer")),
        active: payload.active !== false,
      };
    },

    getUserRole() {
      return this.currentUser?.role || "viewer";
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

    syncEditingPermissions() {
      const roleCanEdit = __FREEBOARD_STATIC__ || this.canEditDashboards();
      const dashboardCanEdit = !this.isSaved || this.dashboard?.canEdit !== false;
      const canEdit = roleCanEdit && dashboardCanEdit;
      this.allowEdit = canEdit;
      if (!canEdit) {
        this.isEditing = false;
      } else if (!this.isEditing) {
        this.isEditing = true;
      }
    },

    /**
     * Load saved settings (e.g., token) from localStorage.
     *
     */
    loadSettingsFromLocalStorage() {
      const item = localStorage.getItem("freeboard");
      if (!item) {
        this.token = null;
        this.currentUser = null;
        this.syncEditingPermissions();
        return;
      }
      try {
        const settings = JSON.parse(item);
        if (settings.token) {
          this.token = settings.token;
        }
      } catch {
        this.token = null;
        this.currentUser = null;
        localStorage.removeItem("freeboard");
      }
      this.hydrateSessionFromToken();
      this.syncEditingPermissions();
      // TODO: Sync with local limited, use indexdb
      /*
      if (dashboard && settings.dashboard) {
        this.dashboard = new Dashboard();
        this.dashboard.deserialize(settings.dashboard);
      } else if (settings.dashboard) {
        const d = new Dashboard()
        d.deserialize(settings.dashboard);
        this.dashboard.settings = d.settings;
      }
        */
    },

    /**
     * Save current settings (e.g., token) to localStorage.
     */
    saveSettingsToLocalStorage() {
      const settings = {};
      if (this.token) {
        settings.token = this.token;
      }
      // TODO Sync - s.a.
      /*
      if (this.dashboard) {
        settings.dashboard = this.dashboard.serialize();
      }
      */
     localStorage.setItem("freeboard", JSON.stringify(settings));
    },

    /**
     * Log in by storing the token and persisting it.
     *
     * @param {string} token - JWT authentication token.
     */
    login(token) {
      this.token = token;
      this.hydrateSessionFromToken();
      this.syncEditingPermissions();
      this.saveSettingsToLocalStorage();
    },

    /**
     * Log out by clearing the token and persisting the change.
     */
    logout() {
      this.token = null;
      this.currentUser = null;
      this.syncEditingPermissions();
      this.saveSettingsToLocalStorage();
    },

    /**
     * Check if the user is authenticated.
     *
     * @returns {boolean} True if a token is present.
     */
    isLoggedIn() {
      return Boolean(this.token && this.currentUser && this.currentUser.active !== false);
    },

    /**
     * Register an authentication provider plugin.
     *
     * @param {Object} plugin - Plugin class with typeName and optional label.
     */
    loadAuthPlugin(plugin) {
      if (plugin.label === undefined) {
        plugin.label = plugin.typeName;
      }

      this.authPlugins[plugin.typeName] = plugin;
    },

    /**
     * Register a datasource plugin.
     *
     * @param {Object} plugin - Plugin class with typeName and optional label.
     */
    loadDatasourcePlugin(plugin) {
      if (plugin.label === undefined) {
        plugin.label = plugin.typeName;
      }

      this.datasourcePlugins[plugin.typeName] = plugin;
    },

    /**
     * Register a widget plugin.
     *
     * @param {Object} plugin - Plugin class with typeName and optional label.
     */
    loadWidgetPlugin(plugin) {
      const normalizedPlugin = validateWidgetPlugin(plugin);
      this.widgetPlugins[normalizedPlugin.typeName] = normalizedPlugin;
    },

    /**
     * Save or update the dashboard via GraphQL and navigate to its route.
     *
     * @param {string} id - Dashboard ID.
     * @param {Object} dashboard - Dashboard input payload.
     * @param {Function} createDashboard - GraphQL create mutation.
     * @param {Function} updateDashboard - GraphQL update mutation.
     */
    async saveDashboard(id, dashboard, createDashboard, updateDashboard) {
      if (this.isSaved) {
        if (!this.dashboard?.canEdit) {
          throw new Error("You do not have permission to edit this dashboard.");
        }
        const result = await updateDashboard({ id, dashboard });
        const updated = result?.data?.updateDashboard;
        if (updated) {
          this.dashboard.visibility = updated.visibility;
          this.dashboard.shareToken = updated.shareToken || null;
          this.dashboard.canEdit = updated.canEdit !== false;
          this.dashboard.canManageSharing = updated.canManageSharing === true;
        }
      } else {
        const createPayload = normalizeCreateDashboardPayload({
          dashboard,
          canPublish: this.canCurrentUserPublish(),
        });
        const result = await createDashboard({ dashboard: createPayload });
        const created = result?.data?.createDashboard;
        this.isSaved = true;
        this.dashboard._id = created._id;
        this.dashboard.visibility = created.visibility;
        this.dashboard.shareToken = created.shareToken || null;
        this.dashboard.canEdit = created.canEdit !== false;
        this.dashboard.canManageSharing = created.canManageSharing === true;
        router.push(`/${created._id}`);
      }
      this.syncEditingPermissions();
    },

    /**
     * Create a DOM node for a style or script asset.
     *
     * @param {"style"|"script"} type - Asset type.
     * @param {string} value - CSS/JS content or URL.
     * @param {boolean} [inline] - Whether to embed inline.
     * @returns {{ node: HTMLElement, type: string, value: string, inline: boolean }}
     */
    createAsset(type, value, inline) {
      let node = null;
      if (inline) {
        if (type === "style") {
          const style = document.createElement("style");
          style.appendChild(document.createTextNode(value));
          node = style;
        } else {
          const script = document.createElement("script");
          script.type = "application/javascript";
          script.appendChild(document.createTextNode(value));
          node = script;
        }
      } else {
        if (type === "style") {
          const link = document.createElement("link");
          link.type = "text/css";
          link.rel = "stylesheet";
          link.href = value;
          node = link;
        } else {
          const script = document.createElement("script");
          script.type = "application/javascript";
          script.src = value;
          node = script;
        }
      }

      return {
        node,
        type,
        value,
        inline,
      };
    },

    /**
     * Load and attach dashboard assets (script, style, resources) to the document.
     */
    loadDashboardAssets() {
      this.showLoadingIndicator = true;
      disposeDashboardAssets(this.assets);

      const assets = {};
      const head = document.head || document.getElementsByTagName("head")[0];

      if (!this.isTrustedExecutionMode()) {
        this.assets = assets;
        this.showLoadingIndicator = false;
        return;
      }

      if (this.dashboard.settings.script) {
        const script = this.createAsset(
          "script",
          this.dashboard.settings.script,
          true
        );
        head.appendChild(script.node);
        assets["script"] = script;
      }

      if (this.dashboard.settings.style) {
        const style = this.createAsset(
          "style",
          this.dashboard.settings.style,
          true
        );
        head.appendChild(style.node);
        assets["style"] = style;
      }

      if (Array.isArray(this.dashboard.settings.resources)) {
        const resources = this.dashboard.settings.resources;
        resources.forEach((element) => {
          const node = this.createAsset(element.type, element.url);
          head.appendChild(node.node);
          assets[element.url] = node;
        });
      }

      this.assets = assets;
      this.showLoadingIndicator = false;
    },

    /**
     * Apply the dashboard theme by setting body class to 'dark' or 'light'.
     */
    loadDashboardTheme() {
      let cssClass;
      if (this.dashboard.settings.theme === "auto") {
        const colorScheme = usePreferredColorScheme();
        cssClass = colorScheme.value === "dark" ? "dark" : "light";
      } else if (this.dashboard.settings.theme === "dark") {
        cssClass = "dark";
      } else {
        cssClass = "light";
      }
      document.body.className = cssClass;
    },

    /**
     * Deserialize and load dashboard data into the store, then apply assets and theme.
     *
     * @param {Object} dashboardData - Serialized dashboard object.
     */
    loadDashboard(dashboardData) {
      this.showLoadingIndicator = true;
      if (this.dashboard) {
        this.dashboard.clearDashboard();
        this.dashboard = null;
      }
      this.dashboard = new Dashboard();
      this.dashboard.deserialize(dashboardData);
      this.loadDashboardAssets();
      this.loadDashboardTheme();
      this.syncEditingPermissions();
      this.showLoadingIndicator = false;
    },

    /**
     * Prompt user to select a local JSON file and load it as dashboard data.
     */
    loadDashboardFromLocalFile() {
      // Check for the various File API support.
      if (window.File && window.FileReader && window.FileList && window.Blob) {
        let input = document.createElement("input");
        input.type = "file";
        input.addEventListener("change", (event) => {
          let files = event.target.files;

          if (files && files.length > 0) {
            let file = files[0];
            let reader = new FileReader();

            reader.addEventListener("load", (fileReaderEvent) => {
              let textFile = fileReaderEvent.target;
              let jsonObject = JSON.parse(textFile.result);

              this.loadDashboard(jsonObject);
              this.isEditing = true;
            });

            reader.readAsText(file);
          }
        });
        input.click();
      } else {
        alert("Unable to load a file in this browser.");
      }
    },

    /**
     * Export the current dashboard as a downloadable JSON file.
     */
    exportDashboard() {
      const contentType = "application/octet-stream";
      const a = document.createElement("a");
      const blob = new Blob(
        [JSON.stringify(this.dashboard.serialize(), null, 2)],
        {
          type: contentType,
        }
      );
      document.body.appendChild(a);
      a.href = window.URL.createObjectURL(blob);
      a.download = `${this.dashboard.title}.json`;
      a.target = "_self";
      a.click();
    },

    /**
     * Dynamically create and mount a modal-like component overlay.
     *
     * @param {import('vue').Component} component - Vue component to render.
     * @param {import('vue').AppContext} appContext - Application context for the component.
     * @param {Object} [props={}] - Props to pass, including onClose hook.
     */
    createComponent(component, appContext, props = {}) {
      const el = document.body.appendChild(document.createElement("div"));
      const c = renderComponent({
        el,
        component,
        appContext,
        props: {
          ...props,
          onClose: (event) => {
            if (props.onClose) {
              props.onClose(event);
            }
            c.destroy();
            document.body.removeChild(el);
          },
        },
      });
    },

    /**
     * Retrieve field definitions for an auth provider plugin instance.
     *
     * @param {Object} authProvider - Auth provider instance.
     * @returns {Array|Object} Field schema or array for the provider.
     */
    getAuthPluginFields(authProvider) {
      const a = this.authPlugins[authProvider.typeName];
      if (typeof a.fields === "function") {
        return a.fields(authProvider, this.dashboard);
      } else {
        return a.fields;
      }
    },

    /**
     * Retrieve field definitions for a datasource plugin instance.
     *
     * @param {Object} datasource - Datasource instance.
     * @returns {Array|Object} Field schema or array for the provider.
     */
    getDatasourcePluginFields(datasource) {
      const d = this.datasourcePlugins[datasource.typeName];
      if (typeof d.fields === "function") {
        return d.fields(datasource, this.dashboard);
      } else {
        return d.fields;
      }
    },

    /**
     * Retrieve field definitions for a widget plugin instance.
     *
     * @param {Object} widget - Widget instance.
     * @returns {Array|Object} Field schema or array for the widget.
     */
    getWidgetPluginFields(widget) {
      if (typeof widget.constructor.fields === "function") {
        return widget.constructor.fields(widget, this.dashboard);
      } else {
        return widget.constructor.fields;
      }
    },
  },
});
