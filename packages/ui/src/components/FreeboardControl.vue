<script setup lang="ts">
/**
 * @component FreeboardControl
 * @description Toolbar for saving, importing, and exporting the Freeboard.
 */
defineOptions({ name: "FreeboardControl" });

import { storeToRefs } from "pinia";
import { useDashboardStore } from "../stores/dashboard.js";
import { useMutation } from "@vue/apollo-composable";
import { DASHBOARD_CREATE_MUTATION, DASHBOARD_UPDATE_MUTATION } from "../gql.js";
import { getCurrentInstance } from "vue";
import { useRouter } from "vue-router";
import SavedDashboardsDialogBox from "./SavedDashboardsDialogBox.vue";
import { openModal } from "../ui/modalHost.js";
import { runtimeConfig } from "../runtime/config.js";

const dashboardStore = useDashboardStore();
const { dashboard, isSaved } = storeToRefs(dashboardStore);

// GraphQL mutations for creating or updating a dashboard
const { mutate: createDashboard } = useMutation(DASHBOARD_CREATE_MUTATION);
const { mutate: updateDashboard } = useMutation(DASHBOARD_UPDATE_MUTATION);
const instance = getCurrentInstance();
const router = useRouter();

/**
 * Serialize current dashboard and invoke save or update mutation via store action.
 */
const saveDashboard = async () => {
  // Local-first (Lite): persist to localStorage, not the server mutations; the
  // static profile has no `/:id` route to navigate to either.
  if (runtimeConfig.isStaticBuild) {
    dashboardStore.saveLocalDashboard();
    return;
  }

  const wasSaved = isSaved.value;
  const id = typeof dashboard.value._id === "string" ? dashboard.value._id : null;
  // The write payload is a portable document plus the envelope visibility; the
  // server stores the document whole and owns the rest of the envelope.
  const payload = {
    document: dashboard.value.toDocument(),
    visibility: dashboard.value.visibility,
  };

  const savedDashboardId = await dashboardStore.saveDashboard(
    id,
    payload,
    createDashboard,
    updateDashboard,
  );
  if (!wasSaved && savedDashboardId) {
    await router.push(`/${savedDashboardId}`);
  }
};

const openSavedDashboards = () => {
  if (!instance) {
    return;
  }
  openModal(SavedDashboardsDialogBox, instance.appContext);
};
</script>

<template>
  <div class="freeboard-control">
    <ul class="freeboard-control__board-toolbar freeboard-control__board-toolbar">
      <!-- Open saved dashboards dialog -->
      <li @click="openSavedDashboards" class="freeboard-control__board-toolbar__item">
        <i class="freeboard-control__board-toolbar__item__icon">
          <v-icon name="hi-collection" />
        </i>
        <label class="freeboard-control__board-toolbar__item__label">
          {{ $t("freeboardControl.labelOpenSaved") }}
        </label>
      </li>
      <!-- Save or Update button -->
      <li @click="saveDashboard" class="freeboard-control__board-toolbar__item">
        <i class="freeboard-control__board-toolbar__item__icon">
          <v-icon name="hi-cloud-upload" />
        </i>
        <label class="freeboard-control__board-toolbar__item__label">
          {{ $t(`freeboardControl.label${isSaved ? "Update" : "Save"}`) }}
        </label>
      </li>
      <!-- Import from local file -->
      <li
        @click="dashboardStore.loadDashboardFromLocalFile()"
        class="freeboard-control__board-toolbar__item"
      >
        <i class="freeboard-control__board-toolbar__item__icon">
          <v-icon name="hi-download" />
        </i>
        <label class="freeboard-control__board-toolbar__item__label">
          {{ $t("freeboardControl.labelImport") }}
        </label>
      </li>
      <!-- Export to local file -->
      <li @click="dashboardStore.exportDashboard()" class="freeboard-control__board-toolbar__item">
        <i class="freeboard-control__board-toolbar__item__icon">
          <v-icon name="hi-upload" />
        </i>
        <label class="freeboard-control__board-toolbar__item__label">
          {{ $t("freeboardControl.labelExport") }}
        </label>
      </li>
    </ul>
  </div>
</template>

<style lang="css" scoped>
@import url("../assets/css/components/freeboard-control.css");
</style>
