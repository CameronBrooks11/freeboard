<script lang="js" setup>
/**
 * @component App
 * @description Root component that sets dynamic document title based on the current dashboard and renders the router view.
 */
defineOptions({ name: 'App' });

import "./assets/css/app.css";
import { RouterView } from "vue-router";

import { useHead } from "@unhead/vue";
import { useDashboardStore } from "./stores/dashboard.js";
import { storeToRefs } from "pinia";

const dashboardStore = useDashboardStore();
const { dashboard } = storeToRefs(dashboardStore);

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
