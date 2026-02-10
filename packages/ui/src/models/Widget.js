/**
 * @module models/Widget
 * @description Client-side model for dashboard widgets, managing lifecycle, rendering, and data updates.
 */

import { storeToRefs } from "pinia";
import { useFreeboardStore } from "../stores/freeboard";
import { generateModelId } from "./id";

const toPositiveInteger = (value, fallback = 1) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(1, Math.ceil(parsed));
};

/**
 * Wrapper around a widget plugin instance, handling type, settings, rendering, and datasource updates.
 *
 * @class Widget
 */
export class Widget {
  /** @type {string} Stable widget identifier for rendering and serialization. */
  id = generateModelId("w");
  /** @type {boolean} Whether the widget should be rendered. */
  shouldRender = true;
  /** @private {boolean} Whether the widget is enabled. */
  _enabled = true;
  /** @type {string|null} Widget title. */
  title = null;
  /** @type {Object|null} Parent pane instance (not used directly here). */
  pane = null;
  /** @private {string|null} Current widget type key. */
  _type = null;
  /** @private {Object|null} Current widget settings. */
  _settings = null;
  /** @type {{changedDatasource?: string|null, snapshot?: Record<string, any>, timestamp?: string}|null} */
  lastContext = null;
  /** @type {unknown|null} Last widget runtime error. */
  lastError = null;

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
   * Create the widget plugin instance for the current type.
   */
  createWidgetInstance() {
    if (!this._type) {
      return;
    }

    const freeboardStore = useFreeboardStore();
    const { widgetPlugins } = storeToRefs(freeboardStore);
    const widgetType = widgetPlugins.value[this._type];

    if (!widgetType || typeof widgetType.newInstance !== "function") {
      return;
    }

    try {
      widgetType.newInstance(this.settings, (widgetInstance) => {
        this.widgetInstance = widgetInstance;
        this.shouldRender = true;
        this.syncRuntimeError();

        if (this.lastContext) {
          this.processDatasourceUpdate(null, this.lastContext);
        }
      });
    } catch (error) {
      this.lastError = error;
      console.error(`Widget '${this._type}' failed to initialize`, error);
    }
  }

  /**
   * Set the widget type and instantiate the corresponding plugin.
   *
   * @param {string} newValue - Type key of the widget plugin.
   */
  set type(newValue) {
    this.disposeWidgetInstance();
    this._type = newValue;

    if (this.enabled) {
      this.createWidgetInstance();
    } else {
      this.shouldRender = true;
    }
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
    const nextValue = newValue || {};

    if (
      this.widgetInstance !== undefined &&
      typeof this.widgetInstance.onSettingsChanged === "function"
    ) {
      this.widgetInstance.onSettingsChanged(nextValue);
      this.syncRuntimeError();
    }

    this._settings = nextValue;
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
   * Enable or disable widget runtime.
   *
   * @param {boolean} newValue
   */
  set enabled(newValue) {
    const nextValue = !!newValue;
    if (this._enabled === nextValue) {
      return;
    }

    this._enabled = nextValue;
    this.shouldRender = true;

    if (this._enabled) {
      this.createWidgetInstance();
    } else {
      this.disposeWidgetInstance();
    }
  }

  /**
   * Get widget enabled status.
   *
   * @returns {boolean}
   */
  get enabled() {
    return this._enabled;
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
    this.element = element;
    if (!this.enabled) {
      this.shouldRender = false;
      return;
    }

    if (
      this.widgetInstance !== undefined &&
      typeof this.widgetInstance.render === "function"
    ) {
      try {
        this.widgetInstance.render(element);
        this.syncRuntimeError();
        this.shouldRender = false;
      } catch (error) {
        this.lastError = error;
        console.error(`Widget '${this.type}' failed to render`, error);
      }
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
      id: this.id,
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
    this.id = object.id || generateModelId("w");
    this.title = object.title;
    this.enabled = object.enabled !== undefined ? !!object.enabled : true;
    this.settings = object.settings;
    this.type = object.type;
    this.shouldRender = true;
  }

  /**
   * Process incoming datasource updates via the plugin instance.
   *
   * @param {Object} datasource - Datasource instance providing new data.
   * @param {{changedDatasource?: string|null, changedDatasourceId?: string|null, changedDatasourceTitle?: string|null, snapshot?: Record<string, any>, timestamp?: string}} [context]
   */
  processDatasourceUpdate(datasource, context = {}) {
    this.lastContext = {
      ...context,
      snapshot: context.snapshot,
    };

    if (
      this.enabled && this.widgetInstance !== undefined &&
      typeof this.widgetInstance.processDatasourceUpdate === "function"
    ) {
      try {
        this.widgetInstance.processDatasourceUpdate(datasource, context);
        this.syncRuntimeError();
      } catch (error) {
        this.lastError = error;
        console.error(`Widget '${this.type}' failed to process datasource update`, error);
      }
    }
  }

  /**
   * Forward container resize events to the widget instance.
   *
   * @param {{width:number, height:number}} size
   */
  onResize(size) {
    if (
      this.enabled && this.widgetInstance !== undefined &&
      typeof this.widgetInstance.onResize === "function"
    ) {
      try {
        this.widgetInstance.onResize(size);
        this.syncRuntimeError();
      } catch (error) {
        this.lastError = error;
        console.error(`Widget '${this.type}' failed to handle resize`, error);
      }
    }
  }

  /**
   * Synchronize wrapper error state with runtime widget instance error state.
   */
  syncRuntimeError() {
    this.lastError = this.widgetInstance?.lastError || null;
  }

  /**
   * Compute preferred rows for pane height clamping.
   *
   * @returns {number}
   */
  getPreferredRows() {
    if (!this.enabled) {
      return 1;
    }

    try {
      if (typeof this.widgetInstance?.getPreferredRows === "function") {
        return toPositiveInteger(
          this.widgetInstance.getPreferredRows(
            this.settings,
            this.lastContext?.snapshot || {}
          )
        );
      }
    } catch (error) {
      this.lastError = error;
      console.error(`Widget '${this.type}' failed to compute preferred rows`, error);
      return 1;
    }

    const freeboardStore = useFreeboardStore();
    const plugin = freeboardStore.widgetPlugins[this.type];
    return toPositiveInteger(plugin?.preferredRows ?? plugin?.minRows ?? 1);
  }
}
