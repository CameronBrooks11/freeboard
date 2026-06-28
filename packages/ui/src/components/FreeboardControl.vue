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
import { useI18n } from "vue-i18n";
import { useRouter } from "vue-router";
import SavedDashboardsDialogBox from "./SavedDashboardsDialogBox.vue";
import { openModal } from "../ui/modalHost.js";
import { runtimeConfig } from "../runtime/config.js";

const dashboardStore = useDashboardStore();
const { dashboard, isSaved } = storeToRefs(dashboardStore);
const { t } = useI18n();

// Local-first (Lite): the saved-dashboards picker is server-only (it lists
// dashboards via GraphQL), so it is absent in a static build. Local Save,
// Import, and Export stay.
const isStaticBuild = runtimeConfig.isStaticBuild;

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
  // Updating an existing dashboard is document-only: visibility is server-owned
  // envelope state changed via its own mutation (setDashboardVisibility). Sending
  // a stale local visibility alongside the document would let a save silently
  // revert a concurrent visibility change (it isn't covered by the
  // document-revision guard). Creating a new dashboard still carries the initial
  // visibility (there's no concurrent change to clobber).
  const payload = wasSaved
    ? { document: dashboard.value.toDocument() }
    : { document: dashboard.value.toDocument(), visibility: dashboard.value.visibility };

  try {
    const savedDashboardId = await dashboardStore.saveDashboard(
      id,
      payload,
      createDashboard,
      updateDashboard,
    );
    if (!wasSaved && savedDashboardId) {
      await router.push(`/${savedDashboardId}`);
    }
  } catch (error) {
    if (isDashboardConflictError(error)) {
      // Optimistic-concurrency conflict: the document advanced elsewhere since
      // it was loaded. Surface it instead of silently overwriting their change.
      window.alert(t("dashboard.saveConflict"));
      return;
    }
    if (isDashboardAccessError(error)) {
      // A codeless server rejection — the access checks throw "Dashboard not
      // found" (no code) when the dashboard is gone or the user lost access,
      // and conflate the two for privacy. Coded errors (FORBIDDEN, BAD_USER_INPUT)
      // are something else and rethrow.
      window.alert(t("dashboard.saveAccessLost"));
      return;
    }
    throw error;
  }
};

const graphQLErrorsOf = (error: unknown): Array<{ extensions?: { code?: unknown } }> => {
  const graphQLErrors = (error as { graphQLErrors?: Array<{ extensions?: { code?: unknown } }> })
    ?.graphQLErrors;
  return Array.isArray(graphQLErrors) ? graphQLErrors : [];
};

/** True when a save failed because the server rejected a stale document revision. */
const isDashboardConflictError = (error: unknown): boolean =>
  graphQLErrorsOf(error).some((entry) => entry?.extensions?.code === "CONFLICT");

/**
 * True when the save was rejected by the access checks, which throw a codeless
 * "Dashboard not found" (deleted or access lost). Coded errors (FORBIDDEN,
 * BAD_USER_INPUT, CONFLICT) are handled elsewhere or rethrown.
 */
const isDashboardAccessError = (error: unknown): boolean => {
  const errors = graphQLErrorsOf(error);
  return errors.length > 0 && errors.every((entry) => !entry?.extensions?.code);
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
    <ul class="freeboard-control__board-toolbar freeboard-control__board-toolbar" role="none">
      <!-- Open saved dashboards dialog (server-only; absent in static builds) -->
      <li
        v-if="!isStaticBuild"
        @click="openSavedDashboards"
        class="freeboard-control__board-toolbar__item"
        v-a11y-button
      >
        <i class="freeboard-control__board-toolbar__item__icon">
          <v-icon name="hi-collection" />
        </i>
        <label class="freeboard-control__board-toolbar__item__label">
          {{ $t("freeboardControl.labelOpenSaved") }}
        </label>
      </li>
      <!-- Save or Update button -->
      <li @click="saveDashboard" class="freeboard-control__board-toolbar__item" v-a11y-button>
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
        v-a11y-button
      >
        <i class="freeboard-control__board-toolbar__item__icon">
          <v-icon name="hi-download" />
        </i>
        <label class="freeboard-control__board-toolbar__item__label">
          {{ $t("freeboardControl.labelImport") }}
        </label>
      </li>
      <!-- Export to local file -->
      <li
        @click="dashboardStore.exportDashboard()"
        class="freeboard-control__board-toolbar__item"
        v-a11y-button
      >
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
