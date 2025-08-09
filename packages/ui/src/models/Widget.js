/**
 * @module models/Widget
 * @description Client-side model for dashboard widgets, managing lifecycle, rendering, and data updates.
 */

import { storeToRefs } from "pinia";
import { useFreeboardStore } from "../stores/freeboard";

/**
 * Wrapper around a widget plugin instance, handling type, settings, rendering, and datasource updates.
 *
 * @class Widget
 */
export class Widget {
  /** @type {boolean} Whether the widget should be rendered. */
  shouldRender = true;
  /** @type {boolean} Whether the widget is enabled. */
  enabled = true;
  /** @type {string|null} Widget title. */
  title = null;
  /** @type {Object|null} Parent pane instance (not used directly here). */
  pane = null;
  /** @private {string|null} Current widget type key. */
  _type = null;
  /** @private {Object|null} Current widget settings. */
  _settings = null;

  /**
   * Construct a Widget with initial settings and type.
   *
   * @param {Object} settings - Initial settings object for the widget.
   * @param {string} type     - Widget type key.
   */
  constructor(settings, type) {
    this.settings = settings;
    this.type = type;
  }

  /**
   * Set the widget type and instantiate the corresponding plugin.
   *
   * @param {string} newValue - Type key of the widget plugin.
   */
  set type(newValue) {
    const freeboardStore = useFreeboardStore();
    const { widgetPlugins } = storeToRefs(freeboardStore);
    this.disposeWidgetInstance();
    if (
      widgetPlugins.value[newValue] &&
      typeof widgetPlugins.value[newValue].newInstance === "function"
    ) {
      const widgetType = widgetPlugins.value[newValue];

      widgetType.newInstance(this.settings, (widgetInstance) => {
        this.widgetInstance = widgetInstance;
        this.shouldRender = true;
      });
    }
    this._type = newValue;
  }

  /**
   * Get the current widget type key.
   *
   * @returns {string|null} Current type identifier.
   */
  get type() {
    return this._type;
  }

  /**
   * Update widget settings and notify the plugin instance.
   *
   * @param {Object} newValue - New settings object.
   */
  set settings(newValue) {
    if (
      this.widgetInstance !== undefined &&
      typeof this.widgetInstance.onSettingsChanged === "function"
    ) {
      this.widgetInstance.onSettingsChanged(newValue);
    }

    this._settings = newValue;
  }

  /**
   * Get the current widget settings.
   *
   * @returns {Object|null} Settings object.
   */
  get settings() {
    return this._settings;
  }

  /**
   * Dispose the underlying widget plugin instance if present.
   */
  disposeWidgetInstance() {
    if (this.widgetInstance !== undefined) {
      if (typeof this.widgetInstance.onDispose === "function") {
        this.widgetInstance.onDispose();
      }

      this.widgetInstance = undefined;
    }
  }

  /**
   * Render the widget into the provided DOM element if enabled.
   *
   * @param {Element} element - DOM element to render the widget into.
   */
  render(element) {
    this.shouldRender = false;
    if (
      this.enabled && this.widgetInstance !== undefined &&
      typeof this.widgetInstance.render === "function"
    ) {
      this.widgetInstance.render(element);
    }
  }

  /**
   * Dispose the widget and its plugin instance.
   */
  dispose() {
    this.disposeWidgetInstance();
  }

  /**
   * Serialize this widget to a plain object.
   *
   * @returns {{ title: string|null, type: string|null, settings: Object|null, enabled: boolean }}
   */
  serialize() {
    return {
      title: this.title,
      type: this.type,
      settings: this.settings,
      enabled: this.enabled,
    };
  }

  /**
   * Populate this widget from a serialized object.
   *
   * @param {{ title: string, type: string, settings: Object, enabled: boolean }} object - Serialized widget data.
   */
  deserialize(object) {
    this.title = object.title;
    this.type = object.type;
    this.settings = object.settings;
    this.enabled = object.enabled;
    this.shouldRender = true;
  }

  /**
   * Process incoming datasource updates via the plugin instance.
   *
   * @param {Object} datasource - Datasource instance providing new data.
   */
  processDatasourceUpdate(datasource) {
    if (
      this.enabled && this.widgetInstance !== undefined &&
      typeof this.widgetInstance.processDatasourceUpdate === "function"
    ) {
      this.widgetInstance.processDatasourceUpdate(datasource);
    }
  }
}
