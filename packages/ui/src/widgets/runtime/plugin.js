/**
 * @module widgets/runtime/plugin
 * @description Validation helpers for widget plugin registration.
 */

/**
 * Default widget fields provider used when plugin does not define one.
 *
 * @param {Object} _widget
 * @param {Object} _dashboard
 * @param {Object} general
 * @returns {Array<Object>}
 */
export const defaultWidgetFields = (_widget, _dashboard, general) => [general];

/**
 * Validate and normalize a widget plugin definition.
 *
 * @param {Object} plugin
 * @returns {Object}
 */
export const validateWidgetPlugin = (plugin) => {
  if (
    !plugin ||
    (typeof plugin !== "object" && typeof plugin !== "function")
  ) {
    throw new Error("Widget plugin must be an object or class");
  }

  if (typeof plugin.typeName !== "string" || plugin.typeName.trim() === "") {
    throw new Error("Widget plugin requires a non-empty string `typeName`");
  }
  plugin.typeName = plugin.typeName.trim();

  if (typeof plugin.newInstance !== "function") {
    throw new Error(
      `Widget plugin '${plugin.typeName}' requires a 'newInstance' function`
    );
  }

  if (plugin.fields === undefined) {
    plugin.fields = defaultWidgetFields;
  } else if (typeof plugin.fields !== "function") {
    throw new Error(
      `Widget plugin '${plugin.typeName}' requires a 'fields(widget, dashboard, general)' function`
    );
  }

  if (plugin.label === undefined) {
    plugin.label = plugin.typeName;
  }

  return plugin;
};
