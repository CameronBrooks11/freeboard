<script setup lang="js">
/**
 * @component Header
 * @description Renders the application header with admin controls, dashboard tools, and column toolbar when in edit mode.
 */
defineOptions({ name: 'Header' });

import { storeToRefs } from "pinia";
import { computed } from "vue";
import { useFreeboardStore } from "../stores/freeboard";
// Admin controls and toggles
import DashboardControl from "./DashboardControl.vue";
import FreeboardControl from "./FreeboardControl.vue";
import ToggleHeaderButton from "./ToggleHeaderButton.vue";
import ColumnToolbar from "./ColumnToolbar.vue";
import { RouterLink } from "vue-router";

// Retrieve editing flags and dashboard instance
const freeboardStore = useFreeboardStore();
const { allowEdit, isEditing } = storeToRefs(freeboardStore);
const showAdminButton = computed(() => freeboardStore.isAdmin());
</script>

<template>
  <header class="header" v-if="allowEdit">
    <Transition name="slide-fade">
      <div class="header__admin-bar" v-if="isEditing">
        <div class="header__admin-bar__admin-menu">
          <RouterLink to="/" class="header__admin-bar__admin-menu__board-logo">
            <h1>
              <i class="ra ra-feather-wing ra-2x"></i>
              {{ $t("header.title") }}
            </h1>
          </RouterLink>
          <div class="header__admin-bar__admin-menu__board-tools">
            <div class="header__admin-bar__admin-menu__admin-link" v-if="showAdminButton">
              <RouterLink to="/admin" class="header__admin-bar__admin-menu__admin-link__button">
                <v-icon name="hi-briefcase" />
                <span>{{ $t("admin.title") }}</span>
              </RouterLink>
            </div>
            <div class="header__admin-bar__admin-menu__board-tools__board-actions">
              <FreeboardControl />
              <DashboardControl />
            </div>
          </div>
        </div>
      </div>
    </Transition>
    <Transition>
      <ColumnToolbar v-if="isEditing" />
    </Transition>
    <ToggleHeaderButton />
  </header>
</template>

<style lang="css" scoped>
@import url("../assets/css/components/header.css");
</style>
