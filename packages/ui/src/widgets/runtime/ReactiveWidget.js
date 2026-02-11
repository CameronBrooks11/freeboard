/**
 * @module widgets/runtime/ReactiveWidget
 * @description Base class for widgets driven by datasource snapshot bindings.
 */

import { resolveBinding, resolveTemplate } from "./bindings.js";

/**
 * Base widget class with snapshot-aware update flow.
 */
export class ReactiveWidget {
  /** @type {Record<string, any>} */
  snapshot = {};

  /** @type {{changedDatasource: string|null, changedDatasourceId?: string|null, changedDatasourceTitle?: string|null, snapshot: Record<string, any>, timestamp?: string}|null} */
  context = null;
  /** @type {unknown|null} */
  lastError = null;

  /**
   * @param {Object} settings
   */
  constructor(settings) {
    this.currentSettings = settings || {};
    this.widgetElement = document.createElement("div");
    this.widgetElement.style.width = "100%";
    this.widgetElement.style.height = "100%";
  }

  /**
   * @param {Element} element
   */
  render(element) {
    if (this.element === element) {
      return;
    }
    this.element = element;
    element.appendChild(this.widgetElement);
  }

  /**
   * @param {Object} newSettings
   */
  onSettingsChanged(newSettings) {
    this.currentSettings = newSettings || {};
    this.refresh();
  }

  /**
   * @param {{title?: string}|null} datasource
   * @param {{changedDatasource?: string|null, changedDatasourceId?: string|null, changedDatasourceTitle?: string|null, snapshot?: Record<string, any>, timestamp?: string}} [context]
   */
  processDatasourceUpdate(datasource, context = {}) {
    if (context.snapshot && typeof context.snapshot === "object") {
      this.snapshot = context.snapshot;
    }

    this.context = {
      changedDatasource:
        context.changedDatasource ?? datasource?.id ?? datasource?.title ?? null,
      changedDatasourceId: context.changedDatasourceId ?? datasource?.id ?? null,
      changedDatasourceTitle:
        context.changedDatasourceTitle ?? datasource?.title ?? null,
      snapshot: this.snapshot,
      timestamp: context.timestamp,
    };

    this.refresh();
  }

  /**
   * Trigger widget-specific re-render based on current bindings.
   */
  refresh() {
    try {
      const inputs = this.resolveInputs();
      this.onInputsChanged(inputs, this.context);
      this.lastError = null;
    } catch (error) {
      this.lastError = error;
      this.onError(error);
    }
  }

  /**
   * Resolve the current bound inputs.
   * Subclasses should override.
   *
   * @returns {Object}
   */
  resolveInputs() {
    return {};
  }

  /**
   * Apply input changes to the widget UI.
   * Subclasses should override.
   */
  onInputsChanged() {}

  /**
   * Handle runtime widget errors without crashing the dashboard update loop.
   *
   * @param {unknown} error
   */
  onError(error) {
    console.error("ReactiveWidget runtime error", error);
  }

  /**
   * Resolve a binding path against the current snapshot.
   *
   * @param {string} path
   * @returns {any}
   */
  getBinding(path) {
    return resolveBinding(path, this.snapshot);
  }

  /**
   * Resolve a template string against the current snapshot.
   *
   * @param {string} template
   * @returns {string}
   */
  getTemplate(template) {
    return resolveTemplate(template, this.snapshot);
  }

  /**
   * Optional resize hook called by container runtime.
   */
  onResize() {}

  /**
   * Cleanup widget resources.
   */
  onDispose() {
    this.widgetElement.remove();
  }
}
