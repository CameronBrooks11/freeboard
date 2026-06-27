<script setup lang="ts">
/**
 * @component DashboardControl
 * @description Renders dashboard action toolbar and inline settings form for title/columns.
 */
defineOptions({ name: "DashboardControl" });

import { storeToRefs } from "pinia";
import { useAuthStore } from "../stores/auth.js";
import { useDashboardStore } from "../stores/dashboard.js";
import Form from "./Form.vue";
import { computed, getCurrentInstance, ref, watch } from "vue";
import type { AppContext } from "vue";
import DatasourcesDialogBox from "./DatasourcesDialogBox.vue";
import SettingsDialogBox from "./SettingsDialogBox.vue";
import ShareDialogBox from "./ShareDialogBox.vue";
import createSettings from "../settings";
import { openModal } from "../ui/modalHost.js";
import { normalizeDashboardTheme } from "../models/Dashboard.js";
import {
  buildBugReportIssueUrl,
  collectBugReportContext,
  copyBugReportContext,
} from "../ui/issueReport.js";
import { useI18n } from "vue-i18n";
import { runtimeConfig } from "../runtime/config.js";

const authStore = useAuthStore();
const dashboardStore = useDashboardStore();
const { dashboard } = storeToRefs(dashboardStore);

// Local-first (Lite): sharing/share-token/collaborator management is server-only,
// so the Share control is absent in a static build.
const isStaticBuild = runtimeConfig.isStaticBuild;
const instance = getCurrentInstance();
const appContext: AppContext | null = instance?.appContext ?? null;
const { t } = useI18n();

// Inline settings schema and current values
type SettingsSection = {
  fields?: Array<Record<string, unknown>>;
};

const fields = computed<Array<Record<string, unknown>>>(() => {
  const sections = createSettings(dashboard.value, {
    allowTrustedExecution: authStore.isTrustedExecutionMode(),
  }) as SettingsSection[];
  return sections[0]?.fields ?? [];
});
const settings = ref<Record<string, unknown>>({});

// Sync settings when the dashboard object changes
watch(
  dashboard,
  (d) => {
    settings.value = {
      title: d.title,
      columns: d.columns,
    };
  },
  {
    immediate: true,
  },
);

/** Open the settings dialog and apply changes on OK */
const openSettingsDialogBox = () => {
  if (!appContext) {
    return;
  }
  const initialThemeSelection = normalizeDashboardTheme(dashboard.value?.settings?.theme);
  let settingsApplied = false;

  openModal(SettingsDialogBox, appContext, {
    onThemePreviewChange: (themeValue: string) => {
      dashboardStore.loadDashboardTheme(themeValue);
    },
    onOk: (newSettings: { settings: Record<string, unknown>; title: string; columns: number }) => {
      settingsApplied = true;
      const currentSettings = dashboard.value.settings;
      const incoming = newSettings.settings;
      const incomingDashboardSettings: Record<string, unknown> = { ...incoming };
      delete incomingDashboardSettings.uiLocale;
      const mergedSettings: typeof dashboard.value.settings = {
        ...currentSettings,
        ...incomingDashboardSettings,
        theme: normalizeDashboardTheme(
          typeof incoming.theme === "string" ? incoming.theme : currentSettings.theme,
        ),
        allowMobileEdit:
          typeof incoming.allowMobileEdit === "boolean"
            ? incoming.allowMobileEdit
            : currentSettings.allowMobileEdit,
      };
      dashboard.value.settings = mergedSettings;
      settings.value = {
        title: newSettings.title,
        columns: newSettings.columns,
      };
      onChange(settings.value);
      dashboardStore.loadDashboardAssets();
      dashboardStore.loadDashboardTheme();
    },
    onClose: () => {
      if (!settingsApplied) {
        dashboardStore.loadDashboardTheme(initialThemeSelection);
      }
    },
  });
};

/** Open the datasources management dialog */
const openDatasourcesDialogBox = () => {
  if (!appContext) {
    return;
  }
  openModal(DatasourcesDialogBox, appContext);
};

/** Open the dashboard share/collaboration dialog */
const openShareDialogBox = () => {
  if (!appContext) {
    return;
  }
  openModal(ShareDialogBox, appContext);
};

const onReportBug = async () => {
  const context = collectBugReportContext();
  const issueUrl = buildBugReportIssueUrl({ context });

  if (typeof window === "undefined") {
    return;
  }

  const popup = window.open(issueUrl, "_blank", "noopener,noreferrer");
  if (popup) {
    return;
  }

  const copied = await copyBugReportContext(context);
  window.alert(
    copied ? t("issueReport.popupBlockedCopied") : t("issueReport.popupBlockedCopyFailed"),
  );
};

/**
 * Apply inline form changes to the dashboard model.
 *
 * @param {{ title: string; columns: string }} s
 */
const onChange = (s: unknown) => {
  const value = s && typeof s === "object" ? (s as Record<string, unknown>) : {};
  dashboard.value.columns = parseInt(String(value.columns || dashboard.value.columns), 10);
  dashboard.value.title = String(value.title || "");
};
</script>

<template>
  <div class="dashboard-control">
    <ul class="dashboard-control__board-toolbar dashboard-control__board-toolbar">
      <li @click="() => openSettingsDialogBox()" class="dashboard-control__board-toolbar__item">
        <i class="dashboard-control__board-toolbar__item__icon"><v-icon name="hi-solid-cog" /></i
        ><label class="dashboard-control__board-toolbar__item__label">{{
          $t("dashboardControl.labelSettings")
        }}</label>
      </li>
      <li @click="() => openDatasourcesDialogBox()" class="dashboard-control__board-toolbar__item">
        <i class="dashboard-control__board-toolbar__item__icon"><v-icon name="hi-database" /></i
        ><label class="dashboard-control__board-toolbar__item__label">{{
          $t("dashboardControl.labelDatasources")
        }}</label>
      </li>
      <li
        v-if="!isStaticBuild"
        @click="() => openShareDialogBox()"
        class="dashboard-control__board-toolbar__item"
      >
        <i class="dashboard-control__board-toolbar__item__icon"><v-icon name="hi-collection" /></i
        ><label class="dashboard-control__board-toolbar__item__label">{{
          $t("dashboardControl.labelShare")
        }}</label>
      </li>
      <li @click="onReportBug" class="dashboard-control__board-toolbar__item">
        <i class="dashboard-control__board-toolbar__item__icon"
          ><v-icon name="hi-clipboard-list" /></i
        ><label class="dashboard-control__board-toolbar__item__label">{{
          $t("dashboardControl.labelReportBug")
        }}</label>
      </li>
      <li @click="() => dashboard.createPane()" class="dashboard-control__board-toolbar__item">
        <i class="dashboard-control__board-toolbar__item__icon"><v-icon name="hi-plus-circle" /></i
        ><label class="dashboard-control__board-toolbar__item__label">{{
          $t("dashboardControl.labelAddPane")
        }}</label>
      </li>
    </ul>
    <div class="dashboard-control__form">
      <Form :settings="settings" :fields="fields" @change="onChange" />
    </div>
  </div>
</template>

<style lang="css" scoped>
@import url("../assets/css/components/dashboard-control.css");
</style>
