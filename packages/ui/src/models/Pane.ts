/**
 * @module models/Pane
 * @description Client-side model for dashboard panes, managing widget layout, ordering, and lifecycle.
 */

import { Widget } from "../models/Widget.js";
import { cloneMutable } from "./clone.js";

type PaneLayout = {
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  i?: string;
} & Record<string, unknown>;

/**
 * Represents a dashboard pane containing widgets and layout configuration.
 *
 * @class Pane
 */
export class Pane {
  /**
   * @type {string|null} Stable, document-unique pane identity (canonical). The
   * grid `layout.i` mirrors it; {@link Dashboard.ensurePaneId} keeps them in sync.
   */
  id: string | null = null;

  /** @type {string|null} Pane title. */
  title: string | null = null;

  /** @type {Widget[]} Array of widgets in this pane. */
  widgets: Widget[] = [];

  /** @type {Object} Layout configuration for this pane. */
  layout: PaneLayout = {};

  /**
   * Check if a widget can move up in the widgets array.
   *
   * @param {Widget} widget - The widget to check.
   * @returns {boolean} True if the widget is not the first item.
   */
  widgetCanMoveUp(widget: Widget): boolean {
    const i = this.widgets.indexOf(widget);
    return i > 0; // avoids true if widget is not found (-1)
  }

  /**
   * Check if a widget can move down in the widgets array.
   *
   * @param {Widget} widget - The widget to check.
   * @returns {boolean} True if the widget is not the last item.
   */
  widgetCanMoveDown(widget: Widget): boolean {
    const i = this.widgets.indexOf(widget);
    return i >= 0 && i < this.widgets.length - 1;
  }

  /**
   * Move a widget one position up.
   *
   * @param {Widget} widget - The widget instance to move.
   */
  moveWidgetUp(widget: Widget): void {
    if (this.widgetCanMoveUp(widget)) {
      const i = this.widgets.indexOf(widget);
      const current = this.widgets[i];
      const previous = this.widgets[i - 1];
      if (!current || !previous) {
        return;
      }
      this.widgets.splice(i - 1, 2, current, previous);
    }
  }

  /**
   * Move a widget one position down.
   *
   * @param {Widget} widget - The widget instance to move.
   */
  moveWidgetDown(widget: Widget): void {
    if (this.widgetCanMoveDown(widget)) {
      const i = this.widgets.indexOf(widget);
      const current = this.widgets[i];
      const next = this.widgets[i + 1];
      if (!current || !next) {
        return;
      }
      this.widgets.splice(i, 2, next, current);
    }
  }

  /**
   * Serialize the pane and its widgets into a plain object.
   *
   * @returns {{ title: string|null, layout: Object, widgets: Object[] }} Serialized pane data.
   */
  serialize() {
    return {
      id: this.id,
      title: this.title,
      layout: this.layout,
      widgets: this.widgets.map((widget) => widget.serialize()),
    };
  }

  /**
   * Deserialize pane data and create widget instances.
   *
   * @param {{ title: string, layout?: Object, widgets?: Object[] }} object - Serialized pane data.
   */
  deserialize(object: {
    id?: string | null;
    title?: string | null;
    layout?: unknown;
    widgets?: Array<Record<string, unknown>>;
  }): void {
    this.id = typeof object.id === "string" && object.id.length > 0 ? object.id : null;
    this.title = object.title ?? null;
    this.layout = cloneMutable<PaneLayout>(object.layout, {});
    this.widgets = [];

    object.widgets?.forEach((widgetConfig: Record<string, unknown>) => {
      const widget = new Widget();
      widget.deserialize(widgetConfig);
      widget.pane = this;
      this.widgets.push(widget);
    });
  }

  /**
   * Dispose all widgets when the pane is removed.
   */
  dispose(): void {
    this.widgets.forEach((widget: Widget) => {
      widget.dispose();
    });
  }
}
