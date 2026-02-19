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
import DatasourcesDialogBox from "./DatasourcesDialogBox.vue";
import SettingsDialogBox from "./SettingsDialogBox.vue";
import ShareDialogBox from "./ShareDialogBox.vue";
import createSettings from "../settings";
import { openModal } from "../ui/modalHost.js";

const authStore = useAuthStore();
const dashboardStore = useDashboardStore();
const { dashboard } = storeToRefs(dashboardStore);

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
  openModal(SettingsDialogBox, instance.appContext, {
    onOk: (newSettings) => {
      dashboard.value.settings = newSettings.settings;
      settings.value = {
        title: newSettings.title,
        columns: newSettings.columns,
      };
      onChange(settings.value);
      dashboardStore.loadDashboardAssets();
      dashboardStore.loadDashboardTheme();
    },
  });
};

/** Open the datasources management dialog */
const openDatasourcesDialogBox = () => {
  openModal(DatasourcesDialogBox, instance.appContext);
};

/** Open the dashboard share/collaboration dialog */
const openShareDialogBox = () => {
  openModal(ShareDialogBox, instance.appContext);
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

const instance = getCurrentInstance();
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
      <li @click="() => openShareDialogBox()" class="dashboard-control__board-toolbar__item">
        <i class="dashboard-control__board-toolbar__item__icon"><v-icon name="hi-collection" /></i
        ><label class="dashboard-control__board-toolbar__item__label">{{
          $t("dashboardControl.labelShare")
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
