/**
 * @module widgets/runtime/ReactiveWidget
 * @description Base class for widgets driven by datasource snapshot bindings.
 */

import { resolveBinding, resolveTemplate } from "./bindings.js";
import type { WidgetRuntimeContext } from "../../types/runtime.js";

/**
 * Base widget class with snapshot-aware update flow.
 */
export class ReactiveWidget {
  /** @type {Record<string, unknown>} */
  snapshot: Record<string, unknown> = {};

  /** @type {{changedDatasource: string|null, changedDatasourceId?: string|null, changedDatasourceTitle?: string|null, snapshot: Record<string, unknown>, timestamp?: string}|null} */
  context:
    | (WidgetRuntimeContext & {
        changedDatasource: string | null;
        snapshot: Record<string, unknown>;
      })
    | null = null;
  /** @type {unknown|null} */
  lastError: unknown | null = null;

  currentSettings: Record<string, unknown>;

  widgetElement: HTMLDivElement;

  element?: Element;

  /**
   * @param {Object} settings
   */
  constructor(settings: Record<string, unknown> = {}) {
    this.currentSettings = settings || {};
    this.widgetElement = document.createElement("div");
    this.widgetElement.style.width = "100%";
    this.widgetElement.style.height = "100%";
  }

  /**
   * @param {Element} element
   */
  render(element: Element) {
    if (this.element === element) {
      return;
    }
    this.element = element;
    element.appendChild(this.widgetElement);
  }

  /**
   * @param {Object} newSettings
   */
  onSettingsChanged(newSettings: Record<string, unknown> = {}) {
    this.currentSettings = newSettings || {};
    this.refresh();
  }

  /**
   * @param {{title?: string}|null} datasource
   * @param {{changedDatasource?: string|null, changedDatasourceId?: string|null, changedDatasourceTitle?: string|null, snapshot?: Record<string, unknown>, timestamp?: string}} [context]
   */
  processDatasourceUpdate(
    datasource: { id?: string; title?: string } | null,
    context: {
      changedDatasource?: string | null;
      changedDatasourceId?: string | null;
      changedDatasourceTitle?: string | null;
      snapshot?: Record<string, unknown>;
      timestamp?: string;
    } = {},
  ) {
    if (context.snapshot && typeof context.snapshot === "object") {
      this.snapshot = context.snapshot;
    }

    this.context = {
      changedDatasource: context.changedDatasource ?? datasource?.id ?? datasource?.title ?? null,
      changedDatasourceId: context.changedDatasourceId ?? datasource?.id ?? null,
      changedDatasourceTitle: context.changedDatasourceTitle ?? datasource?.title ?? null,
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
      this.onError(error as unknown);
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
  onInputsChanged(_inputs?: unknown, _context?: unknown) {
    void _inputs;
    void _context;
  }

  /**
   * Handle runtime widget errors without crashing the dashboard update loop.
   *
   * @param {unknown} error
   */
  onError(error: unknown) {
    console.error("ReactiveWidget runtime error", error);
  }

  /**
   * Resolve a binding path against the current snapshot.
   *
   * @param {string} path
   * @returns {any}
   */
  getBinding(path: unknown): unknown {
    return resolveBinding(path, this.snapshot);
  }

  /**
   * Resolve a template string against the current snapshot.
   *
   * @param {string} template
   * @returns {string}
   */
  getTemplate(template: unknown): string {
    return resolveTemplate(template, this.snapshot);
  }

  /**
   * Optional resize hook called by container runtime.
   */
  onResize(_size?: { width?: number; height?: number }) {
    void _size;
  }

  /**
   * Cleanup widget resources.
   */
  onDispose() {
    this.widgetElement.remove();
  }
}
