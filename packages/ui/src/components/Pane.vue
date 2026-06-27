<script setup lang="ts">
/**
 * @component Pane
 * @description Represents a dashboard pane, rendering its title, controls for editing/deleting the pane or adding widgets, and its widgets.
 *
 * @prop {Object} pane - Pane model instance containing title, layout, and widgets.
 */
defineOptions({ name: "Pane" });

import { useDashboardStore } from "../stores/dashboard.js";
import { storeToRefs } from "pinia";
import ConfirmDialogBox from "./ConfirmDialogBox.vue";
import PaneDialogBox from "./PaneDialogBox.vue";
import WidgetDialogBox from "./WidgetDialogBox.vue";
import Widget from "./Widget.vue";
import { Widget as _Widget } from "../models/Widget";
import { getCurrentInstance } from "vue";
import type { AppContext } from "vue";
import { useI18n } from "vue-i18n";
import { openModal } from "../ui/modalHost.js";
import type { Pane as PaneModel } from "../models/Pane";

const { t } = useI18n();

const dashboardStore = useDashboardStore();
const { isEditing, dashboard } = storeToRefs(dashboardStore);
const instance = getCurrentInstance();
const appContext: AppContext | null = instance?.appContext ?? null;

/**
 * Open dialog to edit the pane’s title.
 *
 * @param {Object} pane - Pane instance to edit.
 */
const openPaneEditDialogBox = (pane: PaneModel) => {
  if (!appContext) {
    return;
  }
  openModal(PaneDialogBox, appContext, {
    header: t("pane.titleEdit"),
    onOk: (newSettings: { settings: { name?: string } }) => {
      pane.title = String(newSettings.settings.name || "");
    },
    settings: { name: pane.title },
  });
};

/**
 * Open confirmation dialog to delete the pane.
 *
 * @param {Object} pane - Pane instance to delete.
 */
const openPaneDeleteDialogBox = (pane: PaneModel) => {
  if (!appContext) {
    return;
  }
  openModal(ConfirmDialogBox, appContext, {
    title: t("pane.titleDelete"),
    onOk: () => dashboard.value.deletePane(pane),
  });
};

/**
 * Open dialog to add a new widget to the pane.
 *
 * @param {Object} pane - Pane instance to add the widget into.
 */
const openWidgetAddDialogBox = (pane: PaneModel) => {
  if (!appContext) {
    return;
  }
  openModal(WidgetDialogBox, appContext, {
    header: t("pane.titleAdd"),
    onOk: (newSettings: {
      enabled: boolean;
      settings: Record<string, unknown>;
      type: string;
      title: string;
    }) => {
      const newViewModel = new _Widget();
      newViewModel.enabled = newSettings.enabled;
      newViewModel.settings = newSettings.settings;
      newViewModel.type = newSettings.type;
      newViewModel.title = newSettings.title;
      dashboard.value.addWidget(pane, newViewModel);
    },
  });
};

// Props passed in from parent component
const { pane } = defineProps<{ pane: PaneModel }>();
</script>

<template>
  <div :style="{ cursor: isEditing ? 'pointer' : 'default' }" class="pane">
    <header class="pane__header">
      <h1>{{ pane.title }}</h1>
      <Transition>
        <!-- Pane action toolbar visible in edit mode -->
        <ul v-if="isEditing" class="pane__header__board-toolbar" role="none">
          <li
            @click="() => openWidgetAddDialogBox(pane)"
            class="pane__header__board-toolbar__item"
            v-a11y-button
            :aria-label="$t('a11y.addWidget')"
          >
            <i class="pane__header__board-toolbar__item__icon">
              <v-icon name="hi-plus" />
            </i>
          </li>
          <li
            @click="() => openPaneEditDialogBox(pane)"
            class="pane__header__board-toolbar__item"
            v-a11y-button
            :aria-label="$t('a11y.editPane')"
          >
            <i class="pane__header__board-toolbar__item__icon">
              <v-icon name="hi-clipboard-list" />
            </i>
          </li>
          <li
            @click="() => openPaneDeleteDialogBox(pane)"
            class="pane__header__board-toolbar__item"
            v-a11y-button
            :aria-label="$t('a11y.deletePane')"
          >
            <i class="pane__header__board-toolbar__item__icon">
              <v-icon name="hi-trash" />
            </i>
          </li>
        </ul>
      </Transition>
    </header>
    <!-- Render each widget in the pane -->
    <Widget v-for="widget in pane.widgets" :widget="widget" :key="widget.id" />
  </div>
</template>

<style lang="css" scoped>
@import url("../assets/css/components/pane.css");
</style>
