/**
 * @module widgets/BaseWidget
 * @description Default widget rendering HTML/CSS/JS templates in an iframe for Freeboard UI.
 */
import { normalizeDatasourceValue } from "./runtime/bindings.js";
import { isTrustedExecutionEnabled } from "../executionPolicy.js";

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
  static fields = (widget, dashboard, general) => {
    const trustedExecution = isTrustedExecutionEnabled();
    const fields = [
      general,
      {
        label: "form.labelStyle",
        icon: "hi-beaker",
        name: "style",
        settings: {
          style: widget?.settings.style,
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
          html: widget?.settings.html,
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
            script: widget?.settings.script,
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
            resources: widget?.settings.resources,
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
    }

    return fields;
  };

  static sanitizeHtmlAttribute(value) {
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
  static template({style, script, html, resources}) {
    const trustedExecution = isTrustedExecutionEnabled();
    const resourceTags = trustedExecution
      ? resources
          ?.map((resource) => {
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
  static newInstance(settings, newInstanceCallback) {
    newInstanceCallback(new BaseWidget(settings));
  }

  /** @type {HTMLIFrameElement} Iframe element used to render the template. */
  iframeElement;

  /** @type {string} Iframe source URL (not used when using srcdoc). */
  iframeSrc;

  /** @type {HTMLDivElement} Container element wrapping the iframe. */
  widgetElement;

  /** @type {Object} Current settings for this widget. */
  currentSettings;

  /** @type {Element} DOM element where the widget is rendered. */
  element;

  /**
   * Create a BaseWidget, setup container and iframe, and apply initial settings.
   *
   * @param {Object} settings - Initial settings containing style, script, html, resources.
   */
  constructor(settings) {
    this.currentSettings = settings;
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
  render(element) {
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
  onSettingsChanged(newSettings) {
    this.currentSettings = newSettings;
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
   * @param {{ snapshot?: Record<string, any> }} [context] - Optional normalized datasource snapshot.
   */
  processDatasourceUpdate(datasource, context = {}) {
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
        ? datasource.latestData
        : {}),
    });
  }
}
