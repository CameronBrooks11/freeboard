import { defineStore } from "pinia";
import { Dashboard, normalizeDashboardTheme } from "../models/Dashboard.js";
import type { ValidationResult } from "@freeboard/core";
import { disposeDashboardAssets } from "../dashboardAssets.js";
import { normalizeCreateDashboardPayload } from "../auth/publishPolicy.js";
import { useAuthStore } from "./auth.js";
import { runtimeConfig } from "../runtime/config.js";
import type { UnknownRecord } from "../types/runtime.js";
import type { Dashboard as DashboardModel } from "../models/Dashboard.js";
import { applyDashboardThemeSelection } from "../ui/themeRuntime.js";

type DashboardMutationPayload = {
  _id?: string;
  visibility?: string;
  shareToken?: string | null;
  shareTokenVersion?: number | string | null;
  canEdit?: boolean;
  canManageSharing?: boolean;
};
type DashboardAsset = {
  node: HTMLElement | null;
  type: string;
  value: string;
  inline: boolean | undefined;
};
type DashboardStoreState = {
  isSaved: boolean;
  isEditing: boolean;
  showLoadingIndicator: boolean;
  dashboard: DashboardModel;
  assets: Record<string, DashboardAsset>;
};

const asRecord = (value: unknown): UnknownRecord =>
  value && typeof value === "object" ? (value as UnknownRecord) : {};

const getMutationData = (value: unknown): UnknownRecord => {
  const result = asRecord(value);
  return asRecord(result.data);
};

const MOBILE_EDIT_MAX_WIDTH_PX = 640;

// Local-first (Lite): the single localStorage key a static build round-trips the
// dashboard through, as a portable v1 DashboardDocument.
const LOCAL_DASHBOARD_KEY = "freeboard:dashboard";

const isMobileViewport = () => {
  if (typeof window === "undefined") {
    return false;
  }

  if (typeof window.matchMedia === "function") {
    return window.matchMedia(`(max-width: ${MOBILE_EDIT_MAX_WIDTH_PX}px)`).matches;
  }

  return Number(window.innerWidth) > 0 && Number(window.innerWidth) <= MOBILE_EDIT_MAX_WIDTH_PX;
};

const createAsset = (type: string, value: string, inline?: boolean) => {
  let node: HTMLElement;
  if (inline) {
    if (type === "style") {
      const style = document.createElement("style");
      style.appendChild(document.createTextNode(value));
      node = style;
    } else {
      const script = document.createElement("script");
      script.type = "application/javascript";
      script.appendChild(document.createTextNode(value));
      node = script;
    }
  } else if (type === "style") {
    const link = document.createElement("link");
    link.type = "text/css";
    link.rel = "stylesheet";
    link.href = value;
    node = link;
  } else {
    const script = document.createElement("script");
    script.type = "application/javascript";
    script.src = value;
    node = script;
  }

  return {
    node,
    type,
    value,
    inline,
  };
};

export const useDashboardStore = defineStore("dashboard", {
  state: (): DashboardStoreState => ({
    isSaved: false,
    isEditing: false,
    showLoadingIndicator: true,
    dashboard: new Dashboard(),
    assets: {},
  }),

  getters: {
    allowEdit(state) {
      const authStore = useAuthStore();
      // Local-first (Lite): a static build is editable and persists locally (Save
      // writes to localStorage), so it grants edit without server auth.
      const roleCanEdit = runtimeConfig.isStaticBuild || authStore.canEditDashboards();
      const dashboardCanEdit = !state.isSaved || state.dashboard?.canEdit !== false;
      return roleCanEdit && dashboardCanEdit;
    },
  },

  actions: {
    isMobileEditLocked() {
      const dashboard = this.dashboard;
      if (!dashboard) {
        return false;
      }

      const isSmallLayout = dashboard.width === "sm";
      const allowMobileEdit = dashboard.settings?.allowMobileEdit === true;
      return isSmallLayout && !allowMobileEdit && isMobileViewport();
    },

    syncEditingPermissions() {
      if (!this.allowEdit || this.isMobileEditLocked()) {
        this.isEditing = false;
      } else if (!this.isEditing) {
        this.isEditing = true;
      }
    },

    setEditing(nextValue: boolean) {
      if (!nextValue) {
        this.isEditing = false;
        return;
      }

      if (!this.allowEdit || this.isMobileEditLocked()) {
        this.isEditing = false;
        return;
      }

      this.isEditing = true;
    },

    toggleEditing() {
      this.setEditing(!this.isEditing);
    },

    async saveDashboard(
      id: string | null,
      dashboard: UnknownRecord,
      createDashboard: (payload: { dashboard: UnknownRecord }) => Promise<unknown>,
      updateDashboard: (payload: {
        id: string | null;
        dashboard: UnknownRecord;
      }) => Promise<unknown>,
    ): Promise<string | null> {
      const authStore = useAuthStore();
      let nextDashboardId = id || null;

      if (this.isSaved) {
        if (!this.dashboard?.canEdit) {
          throw new Error("You do not have permission to edit this dashboard.");
        }
        const result = await updateDashboard({ id, dashboard });
        const updated = getMutationData(result).updateDashboard as
          | DashboardMutationPayload
          | undefined;
        if (updated) {
          this.dashboard.visibility = updated.visibility || this.dashboard.visibility;
          this.dashboard.shareToken = updated.shareToken || null;
          this.dashboard.shareTokenVersion = Number.isFinite(Number(updated.shareTokenVersion))
            ? Math.max(0, Math.floor(Number(updated.shareTokenVersion)))
            : this.dashboard.shareTokenVersion;
          this.dashboard.canEdit = updated.canEdit !== false;
          this.dashboard.canManageSharing = updated.canManageSharing === true;
        }
      } else {
        const createPayload = normalizeCreateDashboardPayload({
          dashboard,
          canPublish: authStore.canCurrentUserPublish(),
        });

        const result = await createDashboard({ dashboard: createPayload });
        const created = getMutationData(result).createDashboard as
          | DashboardMutationPayload
          | undefined;
        if (!created || typeof created._id !== "string" || !created._id.trim()) {
          throw new Error("Dashboard create mutation did not return a dashboard id.");
        }

        this.isSaved = true;
        this.dashboard._id = created._id;
        nextDashboardId = created._id;
        this.dashboard.visibility = created.visibility || this.dashboard.visibility;
        this.dashboard.shareToken = created.shareToken || null;
        this.dashboard.shareTokenVersion = Number.isFinite(Number(created.shareTokenVersion))
          ? Math.max(0, Math.floor(Number(created.shareTokenVersion)))
          : 0;
        this.dashboard.canEdit = created.canEdit !== false;
        this.dashboard.canManageSharing = created.canManageSharing === true;
      }

      this.syncEditingPermissions();
      return nextDashboardId;
    },

    loadDashboardAssets() {
      this.showLoadingIndicator = true;
      disposeDashboardAssets(this.assets);

      const assets: Record<string, DashboardAsset> = {};
      const head = document.head || document.getElementsByTagName("head")[0];
      const authStore = useAuthStore();

      if (!authStore.isTrustedExecutionMode()) {
        this.assets = assets;
        this.showLoadingIndicator = false;
        return;
      }

      if (this.dashboard.settings?.script) {
        const script = createAsset("script", String(this.dashboard.settings.script), true);
        if (script.node) {
          head.appendChild(script.node);
        }
        assets.script = script;
      }

      if (this.dashboard.settings?.style) {
        const style = createAsset("style", String(this.dashboard.settings.style), true);
        if (style.node) {
          head.appendChild(style.node);
        }
        assets.style = style;
      }

      if (Array.isArray(this.dashboard.settings?.resources)) {
        this.dashboard.settings.resources.forEach((element: Record<string, unknown>) => {
          const node = createAsset(String(element.type || ""), String(element.url || ""));
          if (node.node) {
            head.appendChild(node.node);
          }
          assets[String(element.url || "")] = node;
        });
      }

      this.assets = assets;
      this.showLoadingIndicator = false;
    },

    loadDashboardTheme(themeValue?: unknown) {
      const selectedTheme = normalizeDashboardTheme(
        themeValue === undefined ? this.dashboard.settings?.theme : themeValue,
      );
      return applyDashboardThemeSelection(selectedTheme);
    },

    // Server-record load path: a GraphQL response carries the envelope
    // (id/visibility/sharing/ACL/permissions) alongside the content.
    loadDashboard(dashboardData: Record<string, unknown>) {
      this.showLoadingIndicator = true;

      this.dashboard.clearDashboard();
      this.dashboard = new Dashboard();
      this.dashboard.deserialize(dashboardData);
      this.isSaved = Boolean(this.dashboard._id);
      this.loadDashboardAssets();
      this.loadDashboardTheme();
      this.syncEditingPermissions();
      this.showLoadingIndicator = false;
    },

    // Portable-document load path: validate (migrate + structural + semantic) at
    // the trust boundary, then hydrate content only. Atomic — on invalid input no
    // store/dashboard state is touched. The result is always unsaved (no server
    // identity), independent of any envelope-ish fields a legacy file may carry.
    // Validation is reached via dynamic import so Ajv stays in a lazy chunk off
    // the player path.
    async loadDashboardDocument(rawDocument: unknown): Promise<ValidationResult> {
      const { validateDashboardDocument } = await import("@freeboard/core/validate.js");
      const result = validateDashboardDocument(rawDocument);
      if (!result.valid || !result.document) {
        return result;
      }

      this.showLoadingIndicator = true;
      this.dashboard.clearDashboard();
      this.dashboard = new Dashboard();
      this.dashboard.loadDocument(result.document);
      this.isSaved = false;
      this.loadDashboardAssets();
      this.loadDashboardTheme();
      this.syncEditingPermissions();
      this.showLoadingIndicator = false;
      return result;
    },

    // Local-first (Lite) load: hydrate from the single localStorage key, reusing
    // the same validate+migrate seam as file import. Empty/unavailable storage
    // leaves the empty editable dashboard; invalid/corrupt data mutates nothing.
    async loadLocalDashboard(): Promise<void> {
      let raw: string | null;
      try {
        raw = localStorage.getItem(LOCAL_DASHBOARD_KEY);
      } catch {
        return; // storage unavailable — boot the empty editable dashboard
      }
      if (!raw) {
        return; // nothing saved yet — keep the empty editable dashboard
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch {
        alert("Could not load your saved dashboard: the stored data is not valid JSON.");
        return;
      }
      const result = await this.loadDashboardDocument(parsed);
      if (!result.valid) {
        alert("Could not load your saved dashboard: it failed validation.");
      }
    },

    // Local-first (Lite) save: write the portable document to the same key on
    // every save (overwrite, not accumulate). Quota failures surface, not lose.
    saveLocalDashboard(): void {
      try {
        localStorage.setItem(LOCAL_DASHBOARD_KEY, JSON.stringify(this.dashboard.toDocument()));
      } catch {
        alert("Could not save the dashboard to local storage (it may be full).");
      }
    },

    loadDashboardFromLocalFile() {
      if (window.File && window.FileReader && window.FileList && window.Blob) {
        const input = document.createElement("input");
        input.type = "file";
        input.addEventListener("change", (event: Event) => {
          const files = (event.target as HTMLInputElement | null)?.files;

          if (files && files.length > 0) {
            const file = files[0];
            if (!file) {
              return;
            }
            const reader = new FileReader();

            reader.addEventListener("load", async (fileReaderEvent: ProgressEvent<FileReader>) => {
              const textFile = fileReaderEvent.target;
              const fileText = textFile?.result;
              if (typeof fileText !== "string") {
                return;
              }

              let parsed: unknown;
              try {
                parsed = JSON.parse(fileText);
              } catch {
                alert("Import failed: the selected file is not valid JSON.");
                return;
              }

              try {
                const result = await this.loadDashboardDocument(parsed);
                const formatIssues = (issues: ValidationResult["errors"]) =>
                  issues
                    .map((issue) => `• ${issue.message}${issue.path ? ` (${issue.path})` : ""}`)
                    .join("\n");

                if (!result.valid) {
                  alert(`Import failed:\n${formatIssues(result.errors)}`);
                  return;
                }
                if (result.warnings.length > 0) {
                  alert(`Imported with warnings:\n${formatIssues(result.warnings)}`);
                }

                this.isEditing = true;
                this.syncEditingPermissions();
              } catch {
                alert("Import failed: the dashboard validator could not be loaded.");
              }
            });

            reader.readAsText(file);
          }
        });
        input.click();
      } else {
        alert("Unable to load a file in this browser.");
      }
    },

    exportDashboard() {
      const contentType = "application/octet-stream";
      const a = document.createElement("a");
      const blob = new Blob([JSON.stringify(this.dashboard.toDocument(), null, 2)], {
        type: contentType,
      });
      document.body.appendChild(a);
      a.href = window.URL.createObjectURL(blob);
      a.download = `${this.dashboard.title}.json`;
      a.target = "_self";
      a.click();
    },
  },
});
