/**
 * @module settings
 * @description Generates configuration schema for dashboard settings forms.
 */

import { MAX_COLUMNS, MIN_COLUMNS, normalizeDashboardTheme } from "./models/Dashboard.js";
import { UI_LOCALE_AUTO, getUiLocaleSelection } from "./i18n/index.js";
import { UI_LOCALE_OPTIONS, type UiLocale } from "./i18n/catalog.js";
import { DASHBOARD_THEME_CATALOG } from "./ui/themeCatalog.js";

const UI_LOCALE_LABEL_KEYS: Record<UiLocale, string> = {
  en: "form.labelLanguageEnglish",
  fr: "form.labelLanguageFrench",
  es: "form.labelLanguageSpanish",
  de: "form.labelLanguageGerman",
};

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
export default (
  dashboard: {
    title?: unknown;
    columns?: unknown;
    settings?: Record<string, unknown> | null;
  },
  { allowTrustedExecution = true }: { allowTrustedExecution?: boolean } = {},
) => {
  const dashboardSettings =
    dashboard.settings && typeof dashboard.settings === "object"
      ? (dashboard.settings as Record<string, unknown>)
      : {};

  const fields: Array<Record<string, unknown>> = [
    // General settings: title and columns
    {
      label: "form.labelGeneral",
      icon: "hi-home",
      name: "general",
      settings: {
        title: dashboard.title as string | undefined,
        columns: dashboard.columns as number | undefined,
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
    // Theme settings
    {
      label: "form.labelTheme",
      icon: "hi-pencil-alt",
      name: "theme",
      settings: {
        theme: normalizeDashboardTheme(dashboardSettings.theme),
      },
      fields: [
        {
          name: "theme",
          label: "form.labelTheme",
          type: "option",
          default: "auto",
          required: true,
          options: DASHBOARD_THEME_CATALOG.map((themeEntry) => ({
            value: themeEntry.value,
            label: themeEntry.labelKey,
          })),
        },
      ],
    },
    {
      label: "form.labelLanguage",
      icon: "hi-variable",
      name: "language",
      settings: {
        uiLocale: getUiLocaleSelection(),
      },
      fields: [
        {
          name: "uiLocale",
          label: "form.labelLanguage",
          type: "option",
          default: UI_LOCALE_AUTO,
          required: true,
          options: [
            { value: UI_LOCALE_AUTO, label: "form.labelLanguageAuto" },
            ...UI_LOCALE_OPTIONS.map((locale) => ({
              value: locale,
              label: UI_LOCALE_LABEL_KEYS[locale],
            })),
          ],
        },
      ],
    },
    {
      label: "form.labelMobile",
      icon: "hi-solid-chevron-down",
      name: "mobile",
      settings: {
        allowMobileEdit: dashboardSettings.allowMobileEdit ?? false,
      },
      fields: [
        {
          name: "allowMobileEdit",
          label: "form.labelAllowMobileEdit",
          type: "boolean",
          default: false,
          description: "form.descriptionAllowMobileEdit",
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
        style: dashboardSettings.style,
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
        script: dashboardSettings.script,
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
        resources: dashboardSettings.resources,
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
                  data.results.map((r: { latest?: string; name?: string }) => ({
                    value: String(r.latest || ""),
                    label: String(r.name || ""),
                  })),
                ),
            },
          ],
        },
      ],
    },
  );

  return fields;
};
