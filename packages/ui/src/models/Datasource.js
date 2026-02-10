/**
 * @module models/Datasource
 * @description Client-side model for dashboard datasources, handling configuration, lifecycle, and data updates.
 */

import { storeToRefs } from "pinia";
import { useFreeboardStore } from "../stores/freeboard";
import { generateModelId } from "./id";

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
  /** @type {Error|null} Last encountered error, if any. */
  lastError = null;

  /**
   * Update datasource settings and notify plugin instance if available.
   *
   * @param {Object} newValue - New settings for the datasource.
   */
  set settings(newValue) {
    const nextValue = newValue || {};

    if (
      this.datasourceInstance !== undefined &&
      typeof this.datasourceInstance.onSettingsChanged === "function"
    ) {
      this.datasourceInstance.onSettingsChanged(nextValue);
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

    const freeboardStore = useFreeboardStore();
    const { datasourcePlugins } = storeToRefs(freeboardStore);
    const datasourceType = datasourcePlugins.value[this._type];

    if (!datasourceType || typeof datasourceType.newInstance !== "function") {
      return;
    }

    try {
      datasourceType.newInstance(
        this.settings,
        (datasourceInstance) => {
          this.datasourceInstance = datasourceInstance;
          this.lastError = null;
          if (typeof datasourceInstance.updateNow === "function") {
            datasourceInstance.updateNow();
          }
        },
        (newData) => this.updateCallback(newData)
      );
    } catch (error) {
      this.lastError = error;
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

    const freeboardStore = useFreeboardStore();
    const { dashboard } = storeToRefs(freeboardStore);

    this.latestData = newData;
    this.lastUpdated = new Date();
    this.lastError = null;
    dashboard.value.processDatasourceUpdate(this);
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
