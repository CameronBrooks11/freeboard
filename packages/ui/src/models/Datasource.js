/**
 * @module models/Datasource
 * @description Client-side model for dashboard datasources, handling configuration, lifecycle, and data updates.
 */

import { generateModelId } from "./id.js";
import {
  getDashboardId,
  getDatasourcePlugin,
  processDatasourceUpdate,
} from "../runtime/runtimeContext.js";

/**
 * Wrapper around a datasource plugin instance, managing settings, type, and data flow.
 *
 * @class Datasource
 */
export class Datasource {
  /** @type {string} Stable datasource identifier used in bindings. */
  id = generateModelId("ds");
  /** @type {string|null} Display title of the datasource. */
  title = null;
  /** @private {boolean} Whether the datasource is enabled. */
  _enabled = true;
  /** @type {any} Most recently fetched data. */
  latestData = null;
  /** @private {Object} Current settings object for the datasource. */
  _settings = {};
  /** @private {string|null} Current datasource type key. */
  _type = null;
  /** @type {Date|null} Timestamp of last successful update. */
  lastUpdated = null;
  /** @type {Date|null} Timestamp of last received message. */
  lastMessageAt = null;
  /** @type {Date|null} Timestamp of last error. */
  lastErrorAt = null;
  /** @type {Error|null} Last encountered error, if any. */
  lastError = null;
  /** @type {string} Runtime status. */
  status = "idle";
  /** @type {string|null} Runtime error code. */
  errorCode = null;
  /** @type {{messageCount: number, errorCount: number, retryCount: number}} Runtime metrics snapshot. */
  metrics = {
    messageCount: 0,
    errorCount: 0,
    retryCount: 0,
  };

  /**
   * Update datasource settings and notify plugin instance if available.
   *
   * @param {Object} newValue - New settings for the datasource.
   */
  set settings(newValue) {
    const nextValue = newValue || {};

    if (this.datasourceInstance !== undefined) {
      if (typeof this.datasourceInstance.applySettings === "function") {
        this.datasourceInstance.applySettings(nextValue);
      } else if (typeof this.datasourceInstance.onSettingsChanged === "function") {
        this.datasourceInstance.onSettingsChanged(nextValue);
      }
    }
    this._settings = nextValue;
  }

  /**
   * Retrieve the current settings for the datasource.
   *
   * @returns {Object} Current settings object.
   */
  get settings() {
    return this._settings;
  }

  /**
   * Enable or disable the datasource runtime.
   *
   * @param {boolean} newValue
   */
  set enabled(newValue) {
    const nextValue = !!newValue;
    if (this._enabled === nextValue) {
      return;
    }

    this._enabled = nextValue;
    if (this._enabled) {
      this.startDatasourceInstance();
    } else {
      this.disposeDatasourceInstance();
    }
  }

  /**
   * Get datasource enabled status.
   *
   * @returns {boolean}
   */
  get enabled() {
    return this._enabled;
  }

  /**
   * Create a datasource plugin instance for current type/settings.
   */
  startDatasourceInstance() {
    if (!this._type || !this.enabled) {
      return;
    }

    const datasourceType = getDatasourcePlugin(this._type);

    if (!datasourceType || typeof datasourceType.newInstance !== "function") {
      return;
    }

    try {
      datasourceType.newInstance(
        this.settings,
        (datasourceInstance) => {
          this.datasourceInstance = datasourceInstance;
          this.lastError = null;
        },
        (newData) => this.updateCallback(newData),
        (statusPayload) => this.statusCallback(statusPayload),
        {
          datasourceId: this.id,
          dashboardId: getDashboardId(),
        }
      );
    } catch (error) {
      this.lastError = error;
      this.status = "error";
      console.error(`Datasource '${this._type}' failed to initialize`, error);
    }
  }

  /**
   * Set the datasource type and instantiate the corresponding plugin.
   *
   * @param {string} newValue - Type key of the datasource plugin.
   */
  set type(newValue) {
    this._type = newValue;
    this.disposeDatasourceInstance();
    this.startDatasourceInstance();
  }

  /**
   * Get the current datasource type.
   *
   * @returns {string|null} Current type key.
   */
  get type() {
    return this._type;
  }

  /**
   * Dispose the underlying datasource instance if it exists.
   */
  disposeDatasourceInstance() {
    if (this.datasourceInstance !== undefined) {
      if (typeof this.datasourceInstance.onDispose === "function") {
        this.datasourceInstance.onDispose();
      }

      this.datasourceInstance = undefined;
    }
    this.status = this.enabled ? "idle" : "disabled";
  }

  /**
   * Callback invoked by the datasource instance when new data arrives.
   *
   * @param {any} newData - The newly fetched data payload.
   */
  updateCallback(newData) {
    if (!this.enabled) {
      return;
    }

    this.latestData = newData;
    this.lastUpdated = new Date();
    this.lastMessageAt = this.lastUpdated;
    this.lastError = null;
    this.errorCode = null;
    this.status = "connected";
    processDatasourceUpdate(this);
  }

  /**
   * Callback invoked by datasource runtime for status/health updates.
   *
   * @param {Object} statusPayload
   */
  statusCallback(statusPayload = {}) {
    if (statusPayload.status) {
      this.status = statusPayload.status;
    }

    if (statusPayload.lastMessageAt) {
      this.lastMessageAt = new Date(statusPayload.lastMessageAt);
    }
    if (statusPayload.lastUpdatedAt) {
      this.lastUpdated = new Date(statusPayload.lastUpdatedAt);
    }
    if (statusPayload.lastErrorAt) {
      this.lastErrorAt = new Date(statusPayload.lastErrorAt);
    }
    if (statusPayload.errorCode !== undefined) {
      this.errorCode = statusPayload.errorCode || null;
    }
    if (statusPayload.error !== undefined) {
      this.lastError = statusPayload.error
        ? new Error(String(statusPayload.error))
        : null;
    }
    if (statusPayload.metrics && typeof statusPayload.metrics === "object") {
      this.metrics = {
        ...this.metrics,
        ...statusPayload.metrics,
      };
    }
  }

  /**
   * Serialize this Datasource to a plain object.
   *
   * @returns {{ title: string|null, type: string|null, enabled: boolean, settings: Object }}
   */
  serialize() {
    return {
      id: this.id,
      title: this.title,
      type: this.type,
      enabled: this.enabled,
      settings: this.settings,
    };
  }

  /**
   * Populate this Datasource from a serialized object.
   *
   * @param {{ title: string, type: string, enabled: boolean, settings: Object }} object - Serialized data.
   */
  deserialize(object) {
    this.id = object.id || generateModelId("ds");
    this.title = object.title;
    this.enabled = object.enabled !== undefined ? !!object.enabled : true;
    this.settings = object.settings;
    this.type = object.type;
  }

  /**
   * Evaluate a data path expression against the latest data.
   *
   * @param {string} dataPath - JavaScript expression returning a value from `data`.
   * @returns {any} Evaluated value or error if expression invalid.
   */
  getDataRepresentation(dataPath) {
    const valueFunction = new Function("data", "return " + dataPath + ";");
    return valueFunction.call(undefined, this.latestData);
  }

  /**
   * Trigger an immediate data update if supported by the plugin instance.
   */
  updateNow() {
    if (
      this.enabled &&
      this.datasourceInstance !== undefined &&
      typeof this.datasourceInstance.updateNow === "function"
    ) {
      this.datasourceInstance.updateNow();
    }
  }

  /**
   * Dispose this Datasource and its underlying instance.
   */
  dispose() {
    this.disposeDatasourceInstance();
  }
}
