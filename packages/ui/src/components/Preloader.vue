<script setup lang="js">
/**
 * @component Preloader
 * @description Loading indicator with animated bars for async operations.
 */
defineOptions({ name: 'Preloader' });
</script>

<template>
  <div class="preloader">
    <div class="preloader__loading preloader__loading--up"></div>
    <div class="preloader__loading preloader__loading--down"></div>
  </div>
</template>

<style lang="css" scoped>
@import url("../assets/css/components/preloader.css");
</style>
