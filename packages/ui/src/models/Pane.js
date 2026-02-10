/**
 * @module models/Pane
 * @description Client-side model for dashboard panes, managing widget layout, ordering, and lifecycle.
 */

import { storeToRefs } from "pinia";
import { Widget } from "../models/Widget";
import { useFreeboardStore } from "../stores/freeboard";

/**
 * Represents a dashboard pane containing widgets and layout configuration.
 *
 * @class Pane
 */
export class Pane {
  /** @type {string|null} Pane title. */
  title = null;

  /** @type {Widget[]} Array of widgets in this pane. */
  widgets = [];

  /** @type {Object} Layout configuration for this pane. */
  layout = {};

  /**
   * Check if a widget can move up in the widgets array.
   *
   * @param {Widget} widget - The widget to check.
   * @returns {boolean} True if the widget is not the first item.
   */
  widgetCanMoveUp(widget) {
    const i = this.widgets.indexOf(widget);
    return i > 0; // avoids true if widget is not found (-1)
  }

  /**
   * Check if a widget can move down in the widgets array.
   *
   * @param {Widget} widget - The widget to check.
   * @returns {boolean} True if the widget is not the last item.
   */
  widgetCanMoveDown(widget) {
    const i = this.widgets.indexOf(widget);
    return i >= 0 && i < this.widgets.length - 1;
  }

  /**
   * Move a widget one position up.
   *
   * @param {Widget} widget - The widget instance to move.
   */
  moveWidgetUp(widget) {
    if (this.widgetCanMoveUp(widget)) {
      const i = this.widgets.indexOf(widget);
      const array = this.widgets;
      this.widgets.splice(i - 1, 2, array[i], array[i - 1]);
    }
  }

  /**
   * Move a widget one position down.
   *
   * @param {Widget} widget - The widget instance to move.
   */
  moveWidgetDown(widget) {
    if (this.widgetCanMoveDown(widget)) {
      const i = this.widgets.indexOf(widget);
      const array = this.widgets;
      this.widgets.splice(i, 2, array[i + 1], array[i]);
    }
  }

  /**
   * Serialize the pane and its widgets into a plain object.
   *
   * @returns {{ title: string|null, layout: Object, widgets: Object[] }} Serialized pane data.
   */
  serialize() {
    return {
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
  deserialize(object) {
    const freeboardStore = useFreeboardStore();
    const { dashboard } = storeToRefs(freeboardStore);

    this.title = object.title;
    this.layout = object.layout || {};

    object.widgets?.forEach((widgetConfig) => {
      const widget = new Widget();
      widget.deserialize(widgetConfig);
      dashboard.value.addWidget(this, widget);
    });
  }

  /**
   * Dispose all widgets when the pane is removed.
   */
  dispose() {
    this.widgets.forEach((widget) => {
      widget.dispose();
    });
  }
}
