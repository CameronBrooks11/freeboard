<script setup lang="ts">
/**
 * @component TabNavigator
 * @description Renders a tabbed navigation interface for switching between multiple content sections.
 *
 * @prop {Array<Object>} fields - Array of tab definitions, each with `name`, `icon`, `label`, and `fields` or slots.
 */
defineOptions({ name: "TabNavigator" });

import { onMounted, ref } from "vue";

type TabField = {
  name: string;
  icon?: string;
  label?: string;
};

const { fields } = defineProps<{ fields: TabField[] }>();

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
      <ul class="tab-navigator__menu__board-toolbar" role="none">
        <li
          v-for="(field, i) in fields"
          :key="field.name || i"
          @click="() => (index = i)"
          class="tab-navigator__menu__board-toolbar__item"
          :class="{ 'tab-navigator__menu__board-toolbar__item--active': index === i }"
          v-a11y-button
          :aria-pressed="index === i"
          :aria-label="$t(field.label || '') || field.name"
        >
          <i class="tab-navigator__menu__board-toolbar__item__icon">
            <v-icon :name="field.icon || 'hi-cog'" />
          </i>
          <label class="tab-navigator__menu__board-toolbar__item__label">
            {{ $t(field.label || "") }}
          </label>
        </li>
      </ul>
    </div>

    <!-- Tab content -->
    <div ref="tabs" class="tab-navigator__tabs">
      <div
        v-for="(field, i) in fields"
        :key="field.name || i"
        :style="{ display: index === i ? 'inherit' : 'none' }"
      >
        <!-- Render named slot for each tab -->
        <slot :name="field.name || ''" :key="field.name || i"></slot>
      </div>
    </div>
  </div>
</template>

<style lang="css" scoped>
@import url("../assets/css/components/tab-navigator.css");
</style>
