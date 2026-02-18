import { defineStore } from "pinia";
import { Dashboard, normalizeDashboardTheme } from "../models/Dashboard.js";
import { usePreferredColorScheme } from "@vueuse/core";
import { disposeDashboardAssets } from "../dashboardAssets.js";
import { normalizeCreateDashboardPayload } from "../auth/publishPolicy.js";
import { useAuthStore } from "./auth.js";

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
  let node: any = null;
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
  state: () => ({
    isSaved: false,
    isEditing: false,
    showLoadingIndicator: true,
    dashboard: new Dashboard(),
    assets: {},
  }),

  getters: {
    allowEdit(state) {
      const authStore = useAuthStore(this.$pinia);
      const staticMode =
        typeof __FREEBOARD_STATIC__ !== "undefined" && __FREEBOARD_STATIC__ === "true";
      const roleCanEdit = staticMode || authStore.canEditDashboards();
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

    setEditing(nextValue) {
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

    async saveDashboard(id, dashboard, createDashboard, updateDashboard) {
      const authStore = useAuthStore(this.$pinia);
      let nextDashboardId = id || null;

      if (this.isSaved) {
        if (!this.dashboard?.canEdit) {
          throw new Error("You do not have permission to edit this dashboard.");
        }
        const result = await updateDashboard({ id, dashboard });
        const updated = result?.data?.updateDashboard;
        if (updated) {
          this.dashboard.visibility = updated.visibility;
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
        const created = result?.data?.createDashboard;

        this.isSaved = true;
        this.dashboard._id = created._id;
        nextDashboardId = created._id;
        this.dashboard.visibility = created.visibility;
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

      const assets: Record<string, any> = {};
      const head = document.head || document.getElementsByTagName("head")[0];
      const authStore = useAuthStore(this.$pinia);

      if (!authStore.isTrustedExecutionMode()) {
        this.assets = assets;
        this.showLoadingIndicator = false;
        return;
      }

      if (this.dashboard.settings?.script) {
        const script = createAsset("script", this.dashboard.settings.script, true);
        if (script.node) {
          head.appendChild(script.node);
        }
        assets.script = script;
      }

      if (this.dashboard.settings?.style) {
        const style = createAsset("style", this.dashboard.settings.style, true);
        if (style.node) {
          head.appendChild(style.node);
        }
        assets.style = style;
      }

      if (Array.isArray(this.dashboard.settings?.resources)) {
        this.dashboard.settings.resources.forEach((element: any) => {
          const node = createAsset(element.type, element.url);
          if (node.node) {
            head.appendChild(node.node);
          }
          assets[element.url] = node;
        });
      }

      this.assets = assets;
      this.showLoadingIndicator = false;
    },

    loadDashboardTheme() {
      const selectedTheme = normalizeDashboardTheme(this.dashboard.settings?.theme);
      let cssClass;
      if (selectedTheme === "auto") {
        const colorScheme = usePreferredColorScheme();
        cssClass = colorScheme.value === "dark" ? "dark" : "light";
      } else {
        cssClass = selectedTheme;
      }
      document.body.className = cssClass;
    },

    loadDashboard(dashboardData) {
      this.showLoadingIndicator = true;

      if (this.dashboard) {
        this.dashboard.clearDashboard();
        this.dashboard = null;
      }

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
