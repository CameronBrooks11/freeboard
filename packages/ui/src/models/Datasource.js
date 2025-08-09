/**
 * @module models/Datasource
 * @description Client-side model for dashboard datasources, handling configuration, lifecycle, and data updates.
 */

import { storeToRefs } from "pinia";
import { useFreeboardStore } from "../stores/freeboard";

/**
 * Wrapper around a datasource plugin instance, managing settings, type, and data flow.
 *
 * @class Datasource
 */
export class Datasource {
  /** @type {string|null} Display title of the datasource. */
  title = null;
  /** @type {boolean} Whether the datasource is enabled. */
  enabled = true;
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
    if (
      this.datasourceInstance !== undefined &&
      typeof this.datasourceInstance.onSettingsChanged === "function"
    ) {
      this.datasourceInstance.onSettingsChanged(newValue);
    }
    this._settings = newValue;
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
   * Set the datasource type and instantiate the corresponding plugin.
   *
   * @param {string} newValue - Type key of the datasource plugin.
   */
  set type(newValue) {
    const freeboardStore = useFreeboardStore();
    const { datasourcePlugins } = storeToRefs(freeboardStore);

    if (
      newValue in datasourcePlugins.value &&
      typeof datasourcePlugins.value[newValue].newInstance === "function"
    ) {
      const datasourceType = datasourcePlugins.value[newValue];
      datasourceType.newInstance(
        this.settings,
        (datasourceInstance) => {
          this.datasourceInstance = datasourceInstance;
          datasourceInstance.updateNow();
        },
        (newData) => this.updateCallback(newData)
      );
    }
    this._type = newValue;
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
    const freeboardStore = useFreeboardStore();
    const { dashboard } = storeToRefs(freeboardStore);

    this.latestData = newData;
    this.lastUpdated = new Date();
    dashboard.value.processDatasourceUpdate(this);
  }

  /**
   * Serialize this Datasource to a plain object.
   *
   * @returns {{ title: string|null, type: string|null, enabled: boolean, settings: Object }}
   */
  serialize() {
    return {
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
    this.title = object.title;
    this.enabled = object.enabled;
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
