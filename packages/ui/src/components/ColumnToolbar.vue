<script setup lang="js">
/**
 * @component ColumnToolbar
 * @description Toolbar for adjusting the dashboard’s maximum width (column count), rendered on both sides of the board.
 */
defineOptions({ name: 'ColumnToolbar' });

import { storeToRefs } from "pinia";
import { useFreeboardStore } from "../stores/freeboard";

// Access dashboard state from the store
const freeboardStore = useFreeboardStore();
const { dashboard } = storeToRefs(freeboardStore);
</script>

<template>
  <div class="column-toolbar" :class="`column-toolbar--${dashboard.width}`">
    <!-- Left controls: increase/decrease width -->
    <ul class="column-toolbar__board-toolbar column-toolbar__board-toolbar--left">
      <li class="column-toolbar__board-toolbar__item" @click="() => dashboard.increaseMaxWidth()">
        <i class="column-toolbar__board-toolbar__item__icon">
          <v-icon name="hi-solid-chevron-double-left"></v-icon>
        </i>
      </li>
      <li class="column-toolbar__board-toolbar__item" @click="() => dashboard.decreaseMaxWidth()">
        <i class="column-toolbar__board-toolbar__item__icon">
          <v-icon name="hi-solid-chevron-double-right"></v-icon>
        </i>
      </li>
    </ul>

    <!-- Right controls: decrease/increase width -->
    <ul class="column-toolbar__board-toolbar column-toolbar__board-toolbar--right">
      <li class="column-toolbar__board-toolbar__item" @click="() => dashboard.decreaseMaxWidth()">
        <i class="column-toolbar__board-toolbar__item__icon">
          <v-icon name="hi-solid-chevron-double-left"></v-icon>
        </i>
      </li>
      <li class="column-toolbar__board-toolbar__item" @click="() => dashboard.increaseMaxWidth()">
        <i class="column-toolbar__board-toolbar__item__icon">
          <v-icon name="hi-solid-chevron-double-right"></v-icon>
        </i>
      </li>
    </ul>
  </div>
</template>

<style lang="css" scoped>
@import url("../assets/css/components/column-toolbar.css");
</style>
