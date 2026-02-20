<script setup lang="ts">
/**
 * @component Board
 * @description Renders the dashboard grid layout with panes. In editing mode, panes are draggable and resizable.
 */
defineOptions({ name: "Board" });

import { storeToRefs } from "pinia";
import { GridLayout, GridItem } from "vue-grid-layout-v3";
import { useDashboardStore } from "../stores/dashboard.js";
import { computed, watch } from "vue";
import Pane from "./Pane.vue";
import { isSmallDashboardLayout } from "../uiLayoutPolicy";

// Access dashboard state and editing flag from the store
const dashboardStore = useDashboardStore();
const { dashboard, isEditing } = storeToRefs(dashboardStore);
const isSmallLayout = computed(() => isSmallDashboardLayout(dashboard.value?.width));

watch(
  () =>
    dashboard.value?.panes?.map((pane) => ({
      i: pane?.layout?.i,
      h: pane?.layout?.h,
      widgets: pane?.widgets?.length || 0,
    })),
  () => {
    dashboard.value?.clampPaneLayoutHeights?.();
  },
  { deep: true, immediate: true },
);
</script>

<template>
  <div class="board">
    <img class="board__dash-logo" v-if="dashboard.image" :src="dashboard.image" />
    <div v-if="isSmallLayout" class="board__stack">
      <section
        v-for="pane in dashboard.panes"
        :key="String(pane.layout.i)"
        class="board__stack-item"
        :style="{ minHeight: `${Math.max(1, dashboard.getPaneMinRows(pane)) * 30}px` }"
      >
        <Pane :pane="pane" />
      </section>
    </div>
    <GridLayout
      v-else
      :class="`board__grid board__grid--${dashboard.width}`"
      v-model:layout="dashboard.layout"
      :col-num="dashboard.columns"
      :row-height="30"
      :is-draggable="isEditing"
      :is-resizable="isEditing"
      :vertical-compact="true"
      :is-bounded="true"
      :margin="[20, 20]"
      :use-css-transforms="true"
    >
      <GridItem
        v-for="pane in dashboard.panes"
        :x="pane.layout.x"
        :y="pane.layout.y"
        :w="pane.layout.w"
        :h="pane.layout.h"
        :min-h="dashboard.getPaneMinRows(pane)"
        :i="String(pane.layout.i)"
        :key="String(pane.layout.i)"
      >
        <Pane :pane="pane" />
      </GridItem>
    </GridLayout>
  </div>
</template>

<style lang="css" scoped>
@import url("../assets/css/components/board.css");
</style>
