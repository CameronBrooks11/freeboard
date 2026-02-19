/**
 * @module widgets/BaseWidget
 * @description Default widget rendering HTML/CSS/JS templates in an iframe for Freeboard UI.
 */
import { normalizeDatasourceValue } from "./runtime/bindings.js";
import { isTrustedExecutionEnabled } from "../executionPolicy.js";
type WidgetFieldSource = { settings?: Record<string, unknown>; title?: string } | null | undefined;
type BaseWidgetResource = { asset: string; label: string };
type BaseWidgetSettings = {
  style: string;
  script: string;
  html: string;
  resources: BaseWidgetResource[];
};
type DatasourceUpdate = { id?: string; title?: string; latestData?: unknown };

const getWidgetSettings = (widget: WidgetFieldSource): Record<string, unknown> =>
  widget?.settings && typeof widget.settings === "object" ? widget.settings : {};

const normalizeResources = (value: unknown): BaseWidgetResource[] =>
  Array.isArray(value)
    ? value
        .map((resource) => {
          if (!resource || typeof resource !== "object") {
            return null;
          }
          const asset = String((resource as Record<string, unknown>).asset || "").trim();
          if (!asset) {
            return null;
          }
          const label = String((resource as Record<string, unknown>).label || "").trim();
          return { asset, label };
        })
        .filter((resource): resource is BaseWidgetResource => Boolean(resource))
    : [];

const normalizeBaseWidgetSettings = (value: Record<string, unknown>): BaseWidgetSettings => ({
  style: typeof value.style === "string" ? value.style : "",
  script: typeof value.script === "string" ? value.script : "",
  html: typeof value.html === "string" ? value.html : "",
  resources: normalizeResources(value.resources),
});

export class BaseWidget {
  /**
   * Unique widget type identifier.
   * @static
   * @type {string}
   */
  static typeName = "base";

  /**
   * Human-readable widget label.
   * @static
   * @type {string}
   */
  static label = "Base";

  /**
   * Field definitions for configuring BaseWidget in the dashboard editor.
   *
   * @static
   * @param {BaseWidget} widget - Widget instance with current settings.
   * @param {any} dashboard - Dashboard context.
   * @param {Object} general - General field group schema.
   * @returns {Array<Object>} Array of field group objects.
   */
  static fields = (
    widget: WidgetFieldSource,
    dashboard: unknown,
    general: Record<string, unknown>,
  ) => {
    const trustedExecution = isTrustedExecutionEnabled();
    const widgetSettings = getWidgetSettings(widget);
    const fields = [
      general,
      {
        label: "form.labelStyle",
        icon: "hi-beaker",
        name: "style",
        settings: {
          style: widgetSettings.style,
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
      {
        label: "form.labelHTML",
        icon: "hi-code",
        name: "html",
        settings: {
          html: widgetSettings.html,
        },
        fields: [
          {
            name: "html",
            label: "form.labelHTML",
            type: "code",
            language: "html",
          },
        ],
      },
    ];

    if (trustedExecution) {
      fields.push(
        {
          label: "form.labelScript",
          icon: "hi-variable",
          name: "script",
          settings: {
            script: widgetSettings.script,
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
        {
          label: "form.labelResources",
          icon: "hi-archive",
          name: "resources",
          settings: {
            resources: widgetSettings.resources,
          },
          fields: [
            {
              name: "resources",
              label: "form.labelResources",
              type: "array",
              settings: [
                {
                  name: "asset",
                  label: "form.labelAsset",
                  type: "list",
                  options: fetch("https://api.cdnjs.com/libraries/")
                    .then((r) => r.json())
                    .then((data: { results?: Array<{ latest?: string; name?: string }> }) =>
                      (Array.isArray(data.results) ? data.results : []).map(
                        (r: { latest?: string; name?: string }) => ({
                          value: String(r.latest || ""),
                          label: String(r.name || ""),
                        }),
                      ),
                    ),
                },
              ],
            },
          ],
        },
      );
    }

    return fields;
  };

  static sanitizeHtmlAttribute(value: unknown): string {
    return String(value || "")
      .replaceAll("&", "&amp;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;");
  }

  /**
   * Generate the full HTML template including embedded resources, style, and script.
   *
   * @static
   * @param {{style: string, script: string, html: string, resources: Array<{asset: string,label: string}>}} settings - Template settings.
   * @returns {string} HTML document string for iframe srcdoc.
   */
  static template({ style, script, html, resources }: BaseWidgetSettings): string {
    const trustedExecution = isTrustedExecutionEnabled();
    const resourceTags = trustedExecution
      ? resources
          ?.map((resource: BaseWidgetResource) => {
            const src = BaseWidget.sanitizeHtmlAttribute(resource?.asset);
            if (!src) {
              return "";
            }
            return `<script src="${src}"></script>`;
          })
          .filter(Boolean) || []
      : [];
    const scriptTag =
      trustedExecution && typeof script === "string" && script.trim().length > 0
        ? `<script>${script}</script>`
        : "";
    return `
<!DOCTYPE html>
<html lang="en">
  <head>
    ${resourceTags.join("")}
    <style>${style}</style>
    <meta charset="utf-8" />
  </head>
  <body>
    ${html}
    ${scriptTag}
  </body>
</html>
    `;
  }

  /**
   * Factory to create a new BaseWidget instance.
   *
   * @static
   * @param {Object} settings - Initial settings object.
   * @param {function(BaseWidget):void} newInstanceCallback - Callback receiving the new instance.
   */
  static newInstance(
    settings: Record<string, unknown>,
    newInstanceCallback: (instance: BaseWidget) => void,
  ) {
    newInstanceCallback(new BaseWidget(settings));
  }

  /** @type {HTMLIFrameElement} Iframe element used to render the template. */
  iframeElement: HTMLIFrameElement;

  /** @type {string} Iframe source URL (not used when using srcdoc). */
  iframeSrc = "";

  /** @type {HTMLDivElement} Container element wrapping the iframe. */
  widgetElement: HTMLDivElement;

  /** @type {Object} Current settings for this widget. */
  currentSettings: BaseWidgetSettings;

  /** @type {Element} DOM element where the widget is rendered. */
  element: Element | null = null;

  /**
   * Create a BaseWidget, setup container and iframe, and apply initial settings.
   *
   * @param {Object} settings - Initial settings containing style, script, html, resources.
   */
  constructor(settings: Record<string, unknown>) {
    this.currentSettings = normalizeBaseWidgetSettings(settings);
    this.widgetElement = document.createElement("div");
    this.widgetElement.className = "template-widget";
    this.widgetElement.style.width = "100%";
    this.widgetElement.style.height = "100%";

    this.iframeElement = document.createElement("iframe");
    this.iframeElement.style.width = "100%";
    this.iframeElement.style.height = "100%";
    this.iframeElement.referrerPolicy = "no-referrer";

    this.widgetElement.appendChild(this.iframeElement);
    this.onSettingsChanged(settings);
  }

  /**
   * Render the widget into a specified DOM element. Avoid re-rendering if same element.
   *
   * @param {Element} element - Target container element.
   */
  render(element: Element) {
    if (this.element === element) {
      return;
    }
    this.element = element;
    element.appendChild(this.widgetElement);
  }

  /**
   * Update widget settings and reload the iframe content.
   *
   * @param {Object} newSettings - New settings for style, script, html, resources.
   */
  onSettingsChanged(newSettings: Record<string, unknown>) {
    this.currentSettings = normalizeBaseWidgetSettings(newSettings);
    this.iframeElement.sandbox = isTrustedExecutionEnabled()
      ? "allow-scripts allow-forms allow-modals allow-popups"
      : "allow-forms";
    this.iframeElement.srcdoc = BaseWidget.template(this.currentSettings);
  }

  /**
   * Dispose the widget by removing its container from the DOM.
   */
  onDispose() {
    this.widgetElement.remove();
  }

  /**
   * Handle datasource updates by posting messages to the iframe window.
   *
   * @param {Object} datasource - Datasource instance providing the update.
   * @param {{ snapshot?: Record<string, unknown> }} [context] - Optional normalized datasource snapshot.
   */
  processDatasourceUpdate(
    datasource: DatasourceUpdate,
    context: { snapshot?: Record<string, unknown> } = {},
  ) {
    if (!datasource?.id && !datasource?.title) {
      return;
    }

    const value = normalizeDatasourceValue(datasource.latestData);

    this.iframeElement.contentWindow?.postMessage({
      type: "datasource:update",
      datasource: datasource.id ?? datasource.title,
      datasourceId: datasource.id,
      datasourceTitle: datasource.title,
      value,
      snapshot: context.snapshot || {},
      raw: datasource.latestData,
      ...(datasource.latestData && typeof datasource.latestData === "object"
        ? (datasource.latestData as Record<string, unknown>)
        : {}),
    });
  }
}
