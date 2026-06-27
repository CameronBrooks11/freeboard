<script setup lang="ts">
/**
 * @component DatasourcesList
 * @description Displays and manages the list of datasources, allowing add, edit, delete, and manual refresh operations.
 */
defineOptions({ name: "DatasourcesList" });

import { storeToRefs } from "pinia";
import { useDashboardStore } from "../stores/dashboard.js";
import DatasourceDialogBox from "./DatasourceDialogBox.vue";
import ConfirmDialogBox from "./ConfirmDialogBox.vue";
import { Datasource } from "../models/Datasource";
import { getCurrentInstance } from "vue";
import TextButton from "./TextButton.vue";
import { useI18n } from "vue-i18n";
import ActionButton from "./ActionButton.vue";
import { openModal } from "../ui/modalHost.js";
import type { AppContext } from "vue";

const { t } = useI18n();

const dashboardStore = useDashboardStore();
const { dashboard } = storeToRefs(dashboardStore);
const instance = getCurrentInstance();
const appContext: AppContext | null = instance?.appContext ?? null;
type DatasourceDialogPayload = {
  title: string;
  enabled: boolean;
  type: string;
  settings: Record<string, unknown>;
};

const formatDateTime = (value: unknown) => {
  if (!value) {
    return "—";
  }
  const parsed = new Date(String(value));
  if (Number.isNaN(parsed.getTime())) {
    return "—";
  }
  return parsed.toLocaleString();
};

// Open dialog to edit an existing datasource
const openDatasourceEditDialogBox = (datasource: Datasource) => {
  if (!appContext) {
    return;
  }
  openModal(DatasourceDialogBox, appContext, {
    header: t("datasourcesList.titleEdit"),
    datasource,
    onOk: (newSettings: DatasourceDialogPayload) => {
      const previousTitle = datasource.title || "";
      datasource.title = dashboard.value.ensureUniqueDatasourceTitle(
        newSettings.title,
        datasource.id,
      );
      datasource.enabled = newSettings.enabled;
      datasource.type = newSettings.type;
      datasource.settings = newSettings.settings;
      dashboard.value.renameDatasourceBindings(previousTitle, datasource.title);
    },
  });
};

// Open confirmation dialog before deleting a datasource
const openDatasourceDeleteDialogBox = (datasource: Datasource) => {
  if (!appContext) {
    return;
  }
  openModal(ConfirmDialogBox, appContext, {
    title: t("datasourcesList.titleDelete"),
    onOk: () => {
      dashboard.value.deleteDatasource(datasource);
    },
  });
};

// Open dialog to add a new datasource
const openDatasourceAddDialogBox = () => {
  if (!appContext) {
    return;
  }
  openModal(DatasourceDialogBox, appContext, {
    header: t("datasourcesList.titleAdd"),
    onOk: (newSettings: DatasourceDialogPayload) => {
      const newViewModel = new Datasource();
      newViewModel.title = dashboard.value.ensureUniqueDatasourceTitle(newSettings.title);
      newViewModel.enabled = newSettings.enabled;
      newViewModel.settings = newSettings.settings;
      newViewModel.type = newSettings.type;

      dashboard.value.addDatasource(newViewModel);
    },
  });
};
</script>

<template>
  <div class="datasources-list">
    <table class="datasources-list__table" v-if="dashboard.datasources.length">
      <thead class="datasources-list__table__head">
        <tr class="datasources-list__table__head__row">
          <th class="datasources-list__table__head__row__cell">
            {{ t("datasourcesList.labelName") }}
          </th>
          <th class="datasources-list__table__head__row__cell">
            {{ t("datasourcesList.labelLastUpdated") }}
          </th>
          <th class="datasources-list__table__head__row__cell">
            {{ t("datasourcesList.labelStatus") }}
          </th>
          <th class="datasources-list__table__head__row__cell">&nbsp;</th>
        </tr>
      </thead>
      <tbody class="datasources-list__table__body">
        <tr
          v-for="datasource in dashboard.datasources"
          :key="datasource.id"
          class="datasources-list__table__body__row"
        >
          <td class="datasources-list__table__body__row__cell">
            <TextButton @click="() => openDatasourceEditDialogBox(datasource)">{{
              datasource.title
            }}</TextButton>
          </td>
          <td class="datasources-list__table__body__row__cell">
            {{ formatDateTime(datasource.lastUpdated) }}
          </td>
          <td class="datasources-list__table__body__row__cell">
            <span
              class="datasources-list__status"
              :class="`datasources-list__status--${String(datasource.status || 'idle')}`"
            >
              {{ datasource.status || "idle" }}
            </span>
          </td>
          <td class="datasources-list__table__body__row__cell">
            <ul class="datasources-list__table__body__row__cell__board-toolbar" role="none">
              <li
                @click="() => datasource.updateNow()"
                class="datasources-list__table__body__row__cell__board-toolbar__item"
                v-a11y-button
                :aria-label="$t('a11y.refreshDatasource')"
              >
                <i class="datasources-list__table__body__row__cell__board-toolbar__item__icon"
                  ><v-icon name="hi-refresh"></v-icon
                ></i>
              </li>
              <li
                @click="() => openDatasourceDeleteDialogBox(datasource)"
                class="datasources-list__table__body__row__cell__board-toolbar__item"
                v-a11y-button
                :aria-label="$t('a11y.deleteDatasource')"
              >
                <i class="datasources-list__table__body__row__cell__board-toolbar__item__icon"
                  ><v-icon name="hi-trash"></v-icon
                ></i>
              </li>
            </ul>
          </td>
        </tr>
      </tbody>
    </table>
    <div class="datasources-list__operations">
      <ActionButton @click="() => openDatasourceAddDialogBox()">{{
        t("datasourcesList.buttonAdd")
      }}</ActionButton>
    </div>
  </div>
</template>

<style lang="css" scoped>
@import url("../assets/css/components/datasources-list.css");
</style>
