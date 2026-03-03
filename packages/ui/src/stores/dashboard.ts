import { defineStore } from "pinia";
import { Dashboard, normalizeDashboardTheme } from "../models/Dashboard.js";
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

            reader.addEventListener("load", (fileReaderEvent: ProgressEvent<FileReader>) => {
              const textFile = fileReaderEvent.target;
              const result = textFile?.result;
              if (typeof result !== "string") {
                return;
              }
              const jsonObject = JSON.parse(result);

              this.loadDashboard(jsonObject);
              this.isSaved = false;
              this.isEditing = true;
              this.syncEditingPermissions();
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
      const blob = new Blob([JSON.stringify(this.dashboard.serialize(), null, 2)], {
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
