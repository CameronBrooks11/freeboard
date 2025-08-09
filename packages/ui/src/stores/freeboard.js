/**
 * @module stores/freeboard
 * @description Pinia store for Freeboard application state, including dashboard data, plugins, and UI actions.
 */

import { defineStore, storeToRefs } from "pinia";
import renderComponent from "../render";
import { Dashboard } from "../models/Dashboard";
import router from "../router";
import { usePreferredColorScheme } from "@vueuse/core";

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
   *   token: string|null
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
  }),

  actions: {
    /**
     * Load saved settings (e.g., token) from localStorage.
     *
     * @param {Dashboard} [dashboard] - Optional dashboard instance to hydrate.
     */
    loadSettingsFromLocalStorage(dashboard) {
      const item = localStorage.getItem("freeboard");
      if (!item) {
        return;
      }
      const settings = JSON.parse(item);
      if (settings.token) {
        this.token = settings.token;
      }
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
      this.saveSettingsToLocalStorage();
    },

    /**
     * Log out by clearing the token and persisting the change.
     */
    logout() {
      this.token = null;
      this.saveSettingsToLocalStorage();
    },

    /**
     * Check if the user is authenticated.
     *
     * @returns {boolean} True if a token is present.
     */
    isLoggedIn() {
      return !!this.token;
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
      if (plugin.label === undefined) {
        plugin.label = plugin.typeName;
      }

      this.widgetPlugins[plugin.typeName] = plugin;
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
      if (this.isSaved && this.dashboard.isOwner) {
        updateDashboard({ id, dashboard: dashboard });
      } else {
        const result = await createDashboard({ dashboard: dashboard });
        this.isSaved = true;
        this.dashboard._id = result.data.createDashboard._id;
        router.push(`/${result.data.createDashboard._id}`);
      }
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
      const assets = {};
      Object.values(assets).forEach((asset) => {
        asset.node.remove();
        asset.node = null;
      });

      const head = document.head || document.getElementsByTagName("head")[0];

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
