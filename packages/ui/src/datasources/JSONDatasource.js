/**
 * @module datasources/JSONDatasource
 * @description Datasource that fetches JSON data from a URL with optional proxying, refresh interval, and authentication.
 */

import { storeToRefs } from "pinia";
import { useFreeboardStore } from "../stores/freeboard";
import proxy from "../proxy";

/**
 * JSON-based datasource for Freeboard dashboards.
 *
 * @class JSONDatasource
 */
export class JSONDatasource {
  /**
   * Unique type identifier for registration.
   * @static
   * @type {string}
   */
  static typeName = "json";

  /**
   * Human-readable label for UI selection.
   * @static
   * @type {string}
   */
  static label = "JSON";

  /**
   * Field definitions for configuring this datasource in the dashboard editor.
   *
   * @static
   * @param {Object} datasource           - Existing datasource settings.
   * @param {Object} dashboard            - Dashboard context.
   * @param {Object} general              - General field group schema.
   * @returns {Array<Object>} Array of configuration sections.
   */
  static fields = (datasource, dashboard, general) => [
    {
      ...general,
      settings: {
        ...general.settings,
        url: datasource?.settings.url,
        refresh: datasource?.settings.refresh,
        useProxy: datasource?.settings.useProxy,
      },
      fields: [
        ...general.fields,
        {
          name: "url",
          label: "form.labelUrl",
          type: "text",
          required: true,
        },
        {
          name: "useProxy",
          label: "form.labelUseProxy",
          type: "boolean",
          default: true,
        },
        {
          name: "refresh",
          label: "form.labelRefresh",
          type: "number",
          suffix: "form.suffixRefresh",
          default: 5,
          required: true,
        },
      ],
    },
    {
      label: "form.labelHTTP",
      icon: "hi-briefcase",
      name: "http",
      settings: {
        method: datasource?.settings.method,
        body: datasource?.settings.body,
      },
      fields: [
        {
          name: "method",
          label: "form.labelMethod",
          type: "option",
          default: "GET",
          required: true,
          options: [
            { label: "form.labelMethodGET", value: "GET" },
            { label: "form.labelMethodPOST", value: "POST" },
            { label: "form.labelMethodPUT", value: "PUT" },
            { label: "form.labelMethodDELETE", value: "DELETE" },
          ],
        },
        {
          name: "body",
          label: "form.labelBody",
          type: "code",
          language: "json",
        },
      ],
    },
    {
      label: "form.labelAuth",
      icon: "hi-eye",
      name: "auth",
      settings: {
        authProvider: datasource?.settings.authProvider,
      },
      fields: [
        {
          name: "authProvider",
          label: "form.labelAuthProvider",
          type: "option",
          placeholder: "form.placeholderAuthProvider",
          options: dashboard.authProviders.map((a) => ({
            value: a.title,
            label: a.title,
          })),
        },
      ],
    },
  ];

  /**
   * Factory method to create and register a JSONDatasource instance.
   *
   * @static
   * @param {Object} settings            - Initial settings object.
   * @param {function(Object):void} newInstanceCallback - Called with new instance.
   * @param {function(Object):void} updateCallback      - Called with fetched data.
   */
  static newInstance(settings, newInstanceCallback, updateCallback) {
    newInstanceCallback(new JSONDatasource(settings, updateCallback));
  }

  /** @private {number} Timer ID for refresh interval. */
  updateTimer;
  /** @private {Object} Current settings for this datasource. */
  currentSettings;
  /** @private {function(Object):void} Callback to emit fetched data. */
  updateCallback;
  /** @private {number} Error retry stage (0 = initial, increments on failure). */
  errorStage = 0;
  /** @private {boolean} Prevent recursive error retries once locked. */
  lockErrorStage = false;

  /**
   * Initialize datasource with settings and update callback.
   *
   * @param {Object} settings            - Initial settings.
   * @param {function(Object):void} updateCallback - Callback to emit data.
   */
  constructor(settings, updateCallback) {
    this.updateCallback = updateCallback;
    this.onSettingsChanged(settings);
  }

  /**
   * Reset and start the refresh interval timer.
   *
   * @param {number} refreshTime - Interval in milliseconds.
   */
  updateRefresh(refreshTime) {
    if (this.updateTimer) {
      clearInterval(this.updateTimer);
    }

    this.updateTimer = setInterval(() => {
      this.updateNow();
    }, refreshTime);
  }

  /**
   * Fetch data now, handling proxy, auth, and retry logic.
   *
   * @async
   */
  async updateNow() {
    if (this.errorStage > 2) {
      // Maximum retry attempts reached
      return; // TODO: surface error to UI
    }

    let requestURL = this.currentSettings.url;

    if (!requestURL) {
      return;
    }

    // Optionally proxy the request to bypass CORS
    if (this.currentSettings.useProxy) {
      requestURL = proxy(this.currentSettings.url);
    }

    let body = this.currentSettings.body;

    // Attempt to parse JSON body if provided
    if (body) {
      try {
        body = JSON.parse(body);
      } catch {
        // Keep raw request body if it is not valid JSON.
        body = this.currentSettings.body;
      }
    }

    // Retrieve authenticated request headers if auth provider set
    const freeboardStore = useFreeboardStore();
    const { dashboard } = storeToRefs(freeboardStore);

    const authorizedRequest = this.currentSettings.authProvider
      ? await dashboard.value
          .getAuthProviderByName(this.currentSettings.authProvider)
          .createRequest()
      : { headers: {} };

    authorizedRequest.headers["Content-Type"] = "application/json";

    fetch(requestURL, {
      method: this.currentSettings.method || "GET",
      body,
      ...authorizedRequest,
    })
      .then((response) => response.json())
      .then((data) => {
        this.lockErrorStage = true;
        // Emit fetched data to the dashboard
        this.updateCallback({ data });
      })
      .catch(() => {
        if (!this.lockErrorStage) {
          this.errorStage++;
          this.updateNow();
        }
      });
  }

  /**
   * Clean up resources when datasource is disposed.
   */
  onDispose() {
    if (this.updateTimer) {
      clearInterval(this.updateTimer);
    }
  }

  /**
   * Handle changes to settings by resetting state and restarting the timer.
   *
   * @param {Object} newSettings - Updated settings object.
   */
  onSettingsChanged(newSettings) {
    this.lockErrorStage = false;
    this.errorStage = 0;
    
    this.currentSettings = newSettings;
    this.updateRefresh(this.currentSettings.refresh * 1000);
    this.updateNow();
  }
}
