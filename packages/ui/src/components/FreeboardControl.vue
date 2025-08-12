<script setup lang="js">
/**
 * @component FreeboardControl
 * @description Toolbar for saving, importing, and exporting the Freeboard.
 */
defineOptions({ name: 'FreeboardControl' });

import { storeToRefs } from "pinia";
import { useFreeboardStore } from "../stores/freeboard";
import { useMutation } from "@vue/apollo-composable";
import { DASHBOARD_CREATE_MUTATION, DASHBOARD_UPDATE_MUTATION } from "../gql";
import { getCurrentInstance } from "vue";
import SavedDashboardsDialogBox from "./SavedDashboardsDialogBox.vue";

const freeboardStore = useFreeboardStore();
const { dashboard, isSaved } = storeToRefs(freeboardStore);

// GraphQL mutations for creating or updating a dashboard
const { mutate: createDashboard } = useMutation(DASHBOARD_CREATE_MUTATION);
const { mutate: updateDashboard } = useMutation(DASHBOARD_UPDATE_MUTATION);
const instance = getCurrentInstance();



/**
 * Serialize current dashboard and invoke save or update mutation via store action.
 */
const saveDashboard = async () => {
  const d = dashboard.value.serialize();
  const id = d._id;
  // Remove _id so create mutation can generate a new one when needed
  delete d._id;

  await freeboardStore.saveDashboard(id, d, createDashboard, updateDashboard);
};

const openSavedDashboards = () => {
  freeboardStore.createComponent(SavedDashboardsDialogBox, instance.appContext);
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
      <li @click="freeboardStore.loadDashboardFromLocalFile()" class="freeboard-control__board-toolbar__item">
        <i class="freeboard-control__board-toolbar__item__icon">
          <v-icon name="hi-download" />
        </i>
        <label class="freeboard-control__board-toolbar__item__label">
          {{ $t("freeboardControl.labelImport") }}
        </label>
      </li>
      <!-- Export to local file -->
      <li @click="freeboardStore.exportDashboard()" class="freeboard-control__board-toolbar__item">
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
