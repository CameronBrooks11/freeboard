/**
 * @module models/Dashboard
 * @description Client-side model for Freeboard Dashboard, managing panes, datasources, and serialization.
 */

import { Datasource } from "./Datasource.js";
import { Pane } from "./Pane.js";
import {
  buildDatasourceSnapshot,
  clampPaneLayoutHeights,
  ensureUniqueDatasourceTitle,
  getPaneMinRows,
  hasDatasourceTitleConflict,
  replaceDatasourceReferences,
  serializeDashboardState,
} from "./dashboardRuntime.js";
import { generateModelId } from "./id.js";
import { resolveDashboardIsOwner } from "./ownership.js";

/**
 * Minimum number of columns allowed for dashboard layout.
 * @constant {number}
 */
export const MIN_COLUMNS = 3;

/**
 * Maximum number of columns allowed for dashboard layout.
 * @constant {number}
 */
export const MAX_COLUMNS = 12;

/**
 * Supported dashboard width presets.
 * @constant {readonly string[]}
 */
export const DASHBOARD_WIDTH_PRESETS = Object.freeze(["sm", "md", "lg", "xl"]);

/**
 * Default dashboard width preset.
 * @constant {string}
 */
export const DEFAULT_DASHBOARD_WIDTH = "md";

/**
 * Normalize dashboard width values from persisted payloads/settings.
 *
 * @param {string} value
 * @returns {"sm"|"md"|"lg"|"xl"}
 */
export const normalizeDashboardWidth = (value) => {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();
  if (DASHBOARD_WIDTH_PRESETS.includes(normalized)) {
    return normalized;
  }
  return DEFAULT_DASHBOARD_WIDTH;
};

/**
 * Supported dashboard theme presets.
 * @constant {readonly string[]}
 */
export const DASHBOARD_THEME_PRESETS = Object.freeze([
  "auto",
  "light",
  "dark",
  "professional",
  "high-contrast",
  "colorblind",
  "warm",
  "cool",
]);

/**
 * Default dashboard theme preset.
 * @constant {string}
 */
export const DEFAULT_DASHBOARD_THEME = "auto";

/**
 * Normalize dashboard theme values from persisted payloads/settings.
 *
 * @param {string} value
 * @returns {"auto"|"light"|"dark"|"professional"|"high-contrast"|"colorblind"|"warm"|"cool"}
 */
export const normalizeDashboardTheme = (value) => {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();
  if (DASHBOARD_THEME_PRESETS.includes(normalized)) {
    return normalized;
  }
  return DEFAULT_DASHBOARD_THEME;
};

const normalizeBooleanSetting = (value, fallback = false) => {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }
  if (typeof value === "boolean") {
    return value;
  }
  const normalized = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }
  return fallback;
};

/**
 * Represents a Freeboard dashboard with layout, content, and settings.
 *
 * @class Dashboard
 */
export class Dashboard {
  /** @type {string|null} Unique dashboard identifier. */
  _id = null;
  /** @type {string} Dashboard title. */
  title = "Dashboard";
  /** @type {string} Visibility status. */
  visibility = "private";
  /** @type {string|null} Opaque share token for link access. */
  shareToken = null;
  /** @type {number} Monotonic share token version for public/link revoke semantics. */
  shareTokenVersion = 0;
  /** @type {Array<{userId: string, accessLevel: string}>} Dashboard ACL entries. */
  acl = [];
  /** @type {string|null} Optional image URL. */
  image = null;
  /** @type {number} Number of columns in layout. */
  columns = MIN_COLUMNS;
  /** @type {string} Layout width specifier. */
  width = DEFAULT_DASHBOARD_WIDTH;
  /** @type {Array} Collection of datasource instances. */
  datasources = [];
  /** @type {Array} Collection of pane instances. */
  panes = [];
  /** @type {Object} Dashboard settings (theme, style, etc.). */
  settings = {
    theme: DEFAULT_DASHBOARD_THEME,
    allowMobileEdit: false,
  };
  /** @type {boolean} Whether the current user is the owner. */
  isOwner = true;
  /** @type {boolean} Whether current user can edit this dashboard. */
  canEdit = true;
  /** @type {boolean} Whether current user can manage sharing/collaborators. */
  canManageSharing = true;

  /**
   * Get the layout array mapped from pane layouts.
   *
   * @returns {Array<Object>} Layout configurations for each pane.
   */
  get layout() {
    return this.panes.map((pane) => pane.layout);
  }

  /**
   * Set the layout configurations for each pane.
   *
   * @param {Array<Object>} l - Array of layout objects matching pane order.
   */
  set layout(l) {
    l.forEach((layout, index) => {
      this.panes[index].layout = layout;
    });
    this.clampPaneLayoutHeights();
  }

  /**
   * Decrease the dashboard's maximum width setting.
   */
  decreaseMaxWidth() {
    const index = DASHBOARD_WIDTH_PRESETS.indexOf(normalizeDashboardWidth(this.width));
    if (index <= 0) {
      return;
    }
    this.width = DASHBOARD_WIDTH_PRESETS[index - 1];
  }

  /**
   * Increase the dashboard's maximum width setting.
   */
  increaseMaxWidth() {
    const index = DASHBOARD_WIDTH_PRESETS.indexOf(normalizeDashboardWidth(this.width));
    if (index >= DASHBOARD_WIDTH_PRESETS.length - 1) {
      return;
    }
    this.width = DASHBOARD_WIDTH_PRESETS[index + 1];
  }

  /**
   * Serialize the dashboard into a plain object for storage or export.
   *
   * @returns {Object} Serialized dashboard data.
   */
  serialize() {
    return serializeDashboardState(this, __FREEBOARD_VERSION__);
  }

  /**
   * Populate the dashboard from a serialized object.
   *
   * @param {Object} object - Serialized dashboard data.
   */
  deserialize(object) {
    this.version = object.version;
    this._id = object._id;
    this.title = object.title;
    this.columns = object.columns;
    this.image = object.image;
    this.width = normalizeDashboardWidth(object.width);
    this.visibility = typeof object.visibility === "string" ? object.visibility : "private";
    this.shareToken = object.shareToken || null;
    this.shareTokenVersion = Number.isFinite(Number(object.shareTokenVersion))
      ? Math.max(0, Math.floor(Number(object.shareTokenVersion)))
      : 0;
    this.acl = Array.isArray(object.acl) ? object.acl : [];
    const rawSettings =
      object.settings && typeof object.settings === "object" ? object.settings : {};
    this.settings = {
      ...rawSettings,
      theme: normalizeDashboardTheme(rawSettings.theme),
      allowMobileEdit: normalizeBooleanSetting(rawSettings.allowMobileEdit, false),
    };
    this.isOwner = resolveDashboardIsOwner(object);
    this.canEdit = object.canEdit === undefined ? this.isOwner : Boolean(object.canEdit);
    this.canManageSharing =
      object.canManageSharing === undefined ? this.isOwner : Boolean(object.canManageSharing);

    object.datasources?.forEach((datasourceConfig) => {
      const datasource = new Datasource();
      datasource.deserialize(datasourceConfig);
      this.addDatasource(datasource);
    });

    object.panes?.forEach((paneConfig) => {
      const pane = new Pane();
      pane.deserialize(paneConfig);
      this.addPane(pane);
    });

    this.clampPaneLayoutHeights();

    const snapshot = this.buildDatasourceSnapshot();
    const context = {
      changedDatasource: null,
      changedDatasourceId: null,
      changedDatasourceTitle: null,
      snapshot,
      timestamp: new Date().toISOString(),
    };

    this.panes?.forEach((pane) => {
      pane.widgets?.forEach((widget) => widget.processDatasourceUpdate(null, context));
    });
  }

  /**
   * Add a datasource to the dashboard.
   *
   * @param {Datasource} datasource - Datasource instance to add.
   */
  addDatasource(datasource) {
    if (!datasource.id) {
      datasource.id = generateModelId("ds");
    }

    while (this.datasources.some((item) => item.id === datasource.id)) {
      datasource.id = generateModelId("ds");
    }

    datasource.title = this.ensureUniqueDatasourceTitle(datasource.title, datasource.id);

    this.datasources = [...this.datasources, datasource];
  }

  /**
   * Remove a datasource and dispose it.
   *
   * @param {Datasource} datasource - Datasource instance to remove.
   */
  deleteDatasource(datasource) {
    datasource.dispose();
    this.datasources = this.datasources.filter((item) => {
      return item !== datasource;
    });
  }

  /**
   * Add a pane to the dashboard.
   *
   * @param {Pane} pane - Pane instance to add.
   */
  addPane(pane) {
    this.ensurePaneWidgetIds(pane);
    this.ensurePaneLayoutId(pane);
    this.panes = [...this.panes, pane];
    this.clampPaneLayoutHeights();
  }

  /**
   * Remove a pane and dispose it.
   *
   * @param {Pane} pane - Pane instance to remove.
   */
  deletePane(pane) {
    pane.dispose();
    this.panes = this.panes.filter((item) => {
      return item !== pane;
    });
  }

  /**
   * Create and add a new pane with default layout.
   */
  createPane() {
    const newPane = new Pane();
    newPane.title = "Pane";
    newPane.layout = {
      x: this.panes.length % this.columns,
      y: Math.floor(this.panes.length / this.columns),
      w: 1,
      h: 1,
      i: generateModelId("pane"),
    };

    this.addPane(newPane);
  }

  /**
   * Add a widget to a pane and update panes array.
   *
   * @param {Pane} pane - Pane to add the widget into.
   * @param {Widget} widget - Widget instance to add.
   */
  addWidget(pane, widget) {
    if (!widget.id) {
      widget.id = generateModelId("w");
    }

    while (
      pane.widgets.some((item) => item.id === widget.id) ||
      this.panes.some((p) => p.widgets.some((item) => item.id === widget.id))
    ) {
      widget.id = generateModelId("w");
    }

    pane.widgets.push(widget);
    widget.pane = pane;
    this.panes = [...this.panes];
    this.clampPaneLayoutHeights();

    const snapshot = this.buildDatasourceSnapshot();
    widget.processDatasourceUpdate(null, {
      changedDatasource: null,
      changedDatasourceId: null,
      changedDatasourceTitle: null,
      snapshot,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Remove a widget from a pane.
   *
   * @param {Pane} pane - Pane containing the widget.
   * @param {Widget} widget - Widget instance to remove.
   */
  deleteWidget(pane, widget) {
    widget.dispose();
    pane.widgets = pane.widgets.filter((item) => {
      return item !== widget;
    });
    this.panes = [...this.panes];
    this.clampPaneLayoutHeights();
  }

  /**
   * Clear all datasources and panes, disposing each.
   */
  clearDashboard() {
    this.datasources.forEach((datasource) => {
      datasource.dispose();
    });

    this.panes.forEach((pane) => {
      pane.dispose();
    });

    this.datasources = [];
    this.panes = [];
  }

  /**
   * Propagate datasource updates to all widgets.
   *
   * @param {Datasource} datasource - Datasource that has new data.
   */
  processDatasourceUpdate(datasource) {
    const snapshot = this.buildDatasourceSnapshot();
    const context = {
      changedDatasource: datasource?.id ?? datasource?.title ?? null,
      changedDatasourceId: datasource?.id ?? null,
      changedDatasourceTitle: datasource?.title ?? null,
      snapshot,
      timestamp:
        datasource?.lastUpdated instanceof Date
          ? datasource.lastUpdated.toISOString()
          : new Date().toISOString(),
    };

    this.panes?.forEach((pane) => {
      pane.widgets?.forEach((widget) => {
        try {
          widget.processDatasourceUpdate(datasource, context);
        } catch (error) {
          console.error("Failed to propagate datasource update to widget", error);
        }
      });
    });
  }

  /**
   * Build a normalized datasource snapshot map keyed by datasource id,
   * with legacy title aliases when unambiguous.
   *
   * @returns {Record<string, any>}
   */
  buildDatasourceSnapshot() {
    return buildDatasourceSnapshot(this.datasources);
  }

  /**
   * Determine whether a datasource title conflicts with another datasource.
   *
   * @param {string} title
   * @param {string|null} [excludeId]
   * @returns {boolean}
   */
  hasDatasourceTitleConflict(title, excludeId = null) {
    return hasDatasourceTitleConflict(this.datasources, title, excludeId);
  }

  /**
   * Ensure datasource title is unique and non-reserved.
   *
   * @param {string} title
   * @param {string|null} [excludeId]
   * @returns {string}
   */
  ensureUniqueDatasourceTitle(title, excludeId = null) {
    return ensureUniqueDatasourceTitle(this.datasources, title, excludeId);
  }

  /**
   * Compute minimum rows required for a pane based on widget preferred rows.
   *
   * @param {Pane} pane
   * @returns {number}
   */
  getPaneMinRows(pane) {
    return getPaneMinRows(pane);
  }

  /**
   * Clamp pane layout heights to minimum content requirements.
   */
  clampPaneLayoutHeights() {
    clampPaneLayoutHeights(this.panes);
  }

  /**
   * Ensure a pane has a unique grid layout identifier.
   *
   * @param {Pane} pane
   */
  ensurePaneLayoutId(pane) {
    if (!pane.layout || typeof pane.layout !== "object") {
      pane.layout = {};
    }

    const existingIds = new Set(
      this.panes
        .map((item) => item?.layout?.i)
        .filter((value) => value !== undefined && value !== null)
        .map((value) => String(value)),
    );

    const currentId = pane.layout.i;
    if (currentId === undefined || currentId === null) {
      pane.layout.i = generateModelId("pane");
      return;
    }

    const normalizedCurrentId = String(currentId);
    if (existingIds.has(normalizedCurrentId)) {
      pane.layout.i = generateModelId("pane");
      return;
    }

    pane.layout.i = normalizedCurrentId;
  }

  /**
   * Ensure every widget in a pane has a unique identifier across the dashboard.
   *
   * @param {Pane} pane
   */
  ensurePaneWidgetIds(pane) {
    if (!Array.isArray(pane.widgets)) {
      pane.widgets = [];
      return;
    }

    const existingIds = new Set(
      this.panes
        .flatMap((item) => item?.widgets || [])
        .map((widget) => widget?.id)
        .filter((value) => value !== undefined && value !== null)
        .map((value) => String(value)),
    );
    const paneIds = new Set();

    pane.widgets.forEach((widget) => {
      if (!widget) {
        return;
      }

      widget.pane = pane;
      let candidate = widget.id === undefined || widget.id === null ? "" : String(widget.id);

      if (!candidate || existingIds.has(candidate) || paneIds.has(candidate)) {
        candidate = generateModelId("w");
        while (existingIds.has(candidate) || paneIds.has(candidate)) {
          candidate = generateModelId("w");
        }
      }

      widget.id = candidate;
      paneIds.add(candidate);
    });
  }

  /**
   * Rewrite widget binding strings when a datasource title changes.
   * Keeps legacy title-path dashboards functional after title edits.
   *
   * @param {string} oldTitle
   * @param {string} newTitle
   */
  renameDatasourceBindings(oldTitle, newTitle) {
    const from = String(oldTitle || "").trim();
    const to = String(newTitle || "").trim();

    if (!from || !to || from === to) {
      return;
    }

    this.panes?.forEach((pane) => {
      pane.widgets?.forEach((widget) => {
        widget.settings = this.replaceDatasourceReferences(widget.settings, from, to);
      });
    });
  }

  /**
   * Recursively replace datasource title references inside widget settings.
   *
   * @param {any} value
   * @param {string} oldTitle
   * @param {string} newTitle
   * @param {string} [fieldName]
   * @returns {any}
   */
  replaceDatasourceReferences(value, oldTitle, newTitle, fieldName = "") {
    return replaceDatasourceReferences(value, oldTitle, newTitle, fieldName);
  }
}
