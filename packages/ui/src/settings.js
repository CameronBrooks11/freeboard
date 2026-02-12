/**
 * @module settings
 * @description Generates configuration schema for dashboard settings forms.
 */

import { MAX_COLUMNS, MIN_COLUMNS } from "./models/Dashboard";

/**
 * Build settings panels and fields for the dashboard editor.
 *
 * @param {Object} dashboard             - Dashboard object containing current values.
 * @param {string} dashboard.title       - Dashboard title.
 * @param {number} dashboard.columns     - Number of columns in layout.
 * @param {Object} dashboard.settings    - Nested settings object.
 * @param {string} dashboard.settings.theme     - Theme setting.
 * @param {string} dashboard.settings.style     - Custom CSS style.
 * @param {string} dashboard.settings.script    - Custom JS script.
 * @param {Array<string>} dashboard.settings.resources - External resource URLs.
 * @param {boolean} [allowTrustedExecution=true] - Whether trusted script/resource settings are editable.
 * @returns {Array<Object>} Array of settings sections for the UI form.
 */
export default (dashboard, { allowTrustedExecution = true } = {}) => {
  const fields = [
  // General settings: title and columns
    {
      label: "form.labelGeneral",
      icon: "hi-home",
      name: "general",
      settings: {
        title: dashboard.title,
        columns: dashboard.columns,
      },
      fields: [
        {
          name: "title",
          label: "form.labelTitle",
          type: "text",
          required: true,
        },
        {
          name: "columns",
          label: "form.labelColumns",
          type: "option",
          required: true,
          options: [...Array(MAX_COLUMNS).keys()]
            .filter((i) => i >= MIN_COLUMNS - 1)
            .map((i) => ({ value: i + 1, label: `form.labelColumn${i + 1}` })),
        },
      ],
    },
    // Theme settings: auto, light, dark
    {
      label: "form.labelTheme",
      icon: "hi-pencil-alt",
      name: "theme",
      settings: {
        theme: dashboard.settings.theme,
      },
      fields: [
        {
          name: "theme",
          label: "form.labelTheme",
          type: "option",
          default: "auto",
          required: true,
          options: [
            {
              label: "form.labelThemeAuto",
              value: "auto",
            },
            {
              label: "form.labelThemeLight",
              value: "light",
            },
            {
              label: "form.labelThemeDark",
              value: "dark",
            },          
          ],
        },
      ],
    },
  ];

  if (!allowTrustedExecution) {
    return fields;
  }

  fields.push(
    // Style settings: custom CSS
    {
      label: "form.labelStyle",
      icon: "hi-beaker",
      name: "style",
      settings: {
        style: dashboard.settings.style,
      },
      fields: [
        {
          name: "style",
          label: "form.labelStyle",
          type: "code",
          language: "css",
        },
      ],
    },
    // Script settings: custom JavaScript
    {
      label: "form.labelScript",
      icon: "hi-variable",
      name: "script",
      settings: {
        script: dashboard.settings.script,
      },
      fields: [
        {
          name: "script",
          label: "form.labelScript",
          type: "code",
          language: "javascript",
        },
      ],
    },
    // Resources: external library URLs fetched dynamically
    {
      label: "form.labelResources",
      icon: "hi-archive",
      name: "resources",
      settings: {
        resources: dashboard.settings.resources,
      },
      fields: [
        {
          name: "resources",
          label: "form.labelResources",
          type: "array",
          settings: [
            {
              name: "url",
              label: "form.labelUrl",
              type: "list",
              options: fetch("https://api.cdnjs.com/libraries/")
                .then((r) => r.json())
                .then((data) =>
                  data.results.map((r) => ({
                    value: r.latest,
                    label: r.name,
                  }))
                ),
            },
          ],
        },
      ],
    }
  );

  return fields;
};
