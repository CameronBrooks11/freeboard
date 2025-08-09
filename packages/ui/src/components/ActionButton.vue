<template>
  <button type="button" form="" class="action-button">
    <slot></slot>
  </button>
</template>

<script setup lang="js">
/**
 * @component ActionButton
 * @description A button for triggering actions, rendering default slot content.
 * @slot default - Content displayed inside the button (e.g., label or icon).
 */
defineOptions({ name: 'ActionButton' });
</script>

<style lang="css" scoped>
@import url("../assets/css/components/action-button.css");
</style>
