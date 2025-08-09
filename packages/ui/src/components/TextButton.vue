<script setup lang="js">
/**
 * @component TextButton
 * @description Simple button styled as text for inline actions.
 * @slot default - Content rendered inside the button.
 */
defineOptions({ name: 'TextButton' });
</script>

<template>
  <button class="text-button" type="button">
    <slot></slot>
  </button>
</template>

<style lang="css" scoped>
@import url("../assets/css/components/text-button.css");
</style>
