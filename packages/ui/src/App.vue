<script lang="js" setup>
/**
 * @component App
 * @description Root component that sets dynamic document title based on the current dashboard and renders the router view.
 */
defineOptions({ name: 'App' });

import "./assets/css/app.css";
import { RouterView } from "vue-router";

import { useHead } from "@unhead/vue";
import { useFreeboardStore } from "./stores/freeboard";
import { storeToRefs } from "pinia";

const freeboardStore = useFreeboardStore();
const { dashboard } = storeToRefs(freeboardStore);

// Dynamically update the page title when the dashboard changes
useHead({
  title: () =>
    dashboard.value ? `${dashboard.value.title} | Freeboard` : "Freeboard",
});
</script>

<template>
  <!-- Renders the matched route component -->
  <RouterView />
</template>
