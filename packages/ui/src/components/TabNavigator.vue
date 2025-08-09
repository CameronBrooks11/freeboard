<script setup lang="js">
/**
 * @component TabNavigator
 * @description Renders a tabbed navigation interface for switching between multiple content sections.
 *
 * @prop {Array<Object>} fields - Array of tab definitions, each with `name`, `icon`, `label`, and `fields` or slots.
 */
defineOptions({ name: 'TabNavigator' });

import { onMounted, ref } from "vue";

const { fields } = defineProps({
  fields: Array,
});

// Index of currently active tab
const index = ref(0);

onMounted(() => {
  // Initialize to first tab on mount
  index.value = 0;
});
</script>

<template>
  <div class="tab-navigator">
    <!-- Tab menu -->
    <div class="tab-navigator__menu">
      <ul class="tab-navigator__menu__board-toolbar">
        <li v-for="(field, i) in fields" @click="() => (index = i)" class="tab-navigator__menu__board-toolbar__item"
          :class="{ 'tab-navigator__menu__board-toolbar__item--active': index === i }">
          <i class="tab-navigator__menu__board-toolbar__item__icon">
            <v-icon :name="field.icon" />
          </i>
          <label class="tab-navigator__menu__board-toolbar__item__label">
            {{ $t(field.label) }}
          </label>
        </li>
      </ul>
    </div>

    <!-- Tab content -->
    <div ref="tabs" class="tab-navigator__tabs">
      <div v-for="(field, i) in fields" :style="{ display: index === i ? 'inherit' : 'none' }">
        <!-- Render named slot for each tab -->
        <slot :name="field.name" :key="field.name"></slot>
      </div>
    </div>
  </div>
</template>

<style lang="css" scoped>
@import url("../assets/css/components/tab-navigator.css");
</style>
