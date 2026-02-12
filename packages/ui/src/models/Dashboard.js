/**
 * @module models/Dashboard
 * @description Client-side model for Freeboard Dashboard, managing panes, datasources, auth providers, and serialization.
 */

import { AuthProvider } from "./AuthProvider";
import { Datasource } from "./Datasource";
import { Pane } from "./Pane";
import {
  buildDatasourceSnapshot,
  clampPaneLayoutHeights,
  ensureUniqueDatasourceTitle,
  getPaneMinRows,
  hasDatasourceTitleConflict,
  replaceDatasourceReferences,
  serializeDashboardState,
} from "./dashboardRuntime.js";
import { generateModelId } from "./id";
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
  /** @type {Array<{userId: string, accessLevel: string}>} Dashboard ACL entries. */
  acl = [];
  /** @type {string|null} Optional image URL. */
  image = null;
  /** @type {number} Number of columns in layout. */
  columns = MIN_COLUMNS;
  /** @type {string} Layout width specifier. */
  width = "md";
  /** @type {Array} Collection of datasource instances. */
  datasources = [];
  /** @type {Array} Collection of pane instances. */
  panes = [];
  /** @type {Array} Collection of auth provider instances. */
  authProviders = [];
  /** @type {Object} Dashboard settings (theme, style, etc.). */
  settings = {
    theme: "auto",
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
    if (this.width === "md") {
      return;
    }
    if (this.width === "lg") {
      this.width = "md";
    } else {
      this.width = "lg";
    }
  }

  /**
   * Increase the dashboard's maximum width setting.
   */
  increaseMaxWidth() {
    if (this.width === "xl") {
      return;
    }
    if (this.width === "lg") {
      this.width = "xl";
    } else {
      this.width = "lg";
    }
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
    this.width = object.width;
    this.visibility =
      typeof object.visibility === "string"
        ? object.visibility
        : "private";
    this.shareToken = object.shareToken || null;
    this.acl = Array.isArray(object.acl) ? object.acl : [];
    this.settings = object.settings || {};
    this.isOwner = resolveDashboardIsOwner(object);
    this.canEdit =
      object.canEdit === undefined ? this.isOwner : Boolean(object.canEdit);
    this.canManageSharing =
      object.canManageSharing === undefined
        ? this.isOwner
        : Boolean(object.canManageSharing);

    object.authProviders?.forEach((providerConfig) => {
      const authProvider = new AuthProvider();
      authProvider.deserialize(providerConfig);
      this.addAuthProvider(authProvider);
    });

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
   * Add an authentication provider to the dashboard.
   *
   * @param {AuthProvider} authProvider - Provider instance to add.
   */
  addAuthProvider(authProvider) {
    this.authProviders = [...this.authProviders, authProvider];
  }

  /**
   * Remove an authentication provider from the dashboard.
   *
   * @param {AuthProvider} authProvider - Provider instance to remove.
   */
  deleteAuthProvider(authProvider) {
    this.authProviders = this.authProviders.filter((item) => {
      return item !== authProvider;
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
        .map((value) => String(value))
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
   * Retrieve an auth provider instance by its title.
   *
   * @param {string} title - Title of the auth provider.
   * @returns {any} The auth provider instance or undefined.
   */
  getAuthProviderByName(title) {
    return this.authProviders.find((a) => a.title === title)
      ?.authProviderInstance;
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
