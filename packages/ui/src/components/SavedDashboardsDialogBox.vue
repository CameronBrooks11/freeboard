<script setup lang="js">
/**
 * @component SavedDashboardsDialogBox
 * @description
 * Modal dialog that lists all saved dashboards for the current user.
 * Allows the user to select and open a dashboard, loading it into the Freeboard instance.
 * If a dashboard is not found in the local state, it fetches it from the backend.
 *
 * @prop {Function} onClose - Callback to invoke when the dialog is closed.
 *
 * @example
 * <SavedDashboardsDialogBox :onClose="closeDialog" />
 */

defineOptions({ name: 'SavedDashboardsDialogBox' });

import { useQuery } from "@vue/apollo-composable";
import { ref } from "vue";
import { useRouter } from "vue-router";
import DialogBox from "./DialogBox.vue";
import { DASHBOARDS_LIST_QUERY, DASHBOARD_READ_QUERY } from "../gql";
import { useFreeboardStore } from "../stores/freeboard";

// ===== Props =====
const { onClose } = defineProps({ onClose: Function });

// ===== Store & Router =====
const router = useRouter();
const freeboardStore = useFreeboardStore();

// ===== Queries =====
// List all dashboards
const { result, loading, error } = useQuery(DASHBOARDS_LIST_QUERY);

// UI state to track if a dashboard is being opened
const picking = ref(false);

/**
 * @function openDashboard
 * @description
 * Navigate to and load the selected dashboard by ID.
 * Falls back to fetching the dashboard data directly if route navigation fails.
 *
 * @param {string} id - Dashboard ID to load.
 * @returns {Promise<void>}
 */
const openDashboard = async (id) => {
  picking.value = true;
  try {
    // Navigate to dashboard route
    await router.push(`/${id}`);
  } catch (_) {
    // Fallback: fetch dashboard directly if navigation fails
    const { onResult } = useQuery(DASHBOARD_READ_QUERY, { id });
    await new Promise((resolve) => {
      onResult(({ data }) => {
        if (data?.dashboard) freeboardStore.loadDashboard(data.dashboard);
        resolve();
      });
    });
  } finally {
    picking.value = false;
    if (onClose) onClose();
  }
};
</script>

<template>
  <!-- Dialog container -->
  <DialogBox :header="$t('savedDashboards.title')" :cancel="$t('dialogBox.buttonCancel')" @close="onClose">
    <!-- Loading state -->
    <div v-if="loading">{{ $t('savedDashboards.loading') }}</div>

    <!-- Error state -->
    <div v-else-if="error">{{ $t('savedDashboards.error') }}</div>

    <!-- Saved dashboards list -->
    <ul v-else class="saved-dashboards">
      <li v-for="d in result?.dashboards || []" :key="d._id" class="saved-dashboards__item">
        <button class="saved-dashboards__button" :disabled="picking" @click="openDashboard(d._id)">
          <span class="saved-dashboards__title">{{ d.title || d._id }}</span>
          <span class="saved-dashboards__meta">
            {{ d.published ? $t('savedDashboards.published') : $t('savedDashboards.private') }}
          </span>
        </button>
      </li>

      <!-- Empty state -->
      <li v-if="(result?.dashboards || []).length === 0" class="saved-dashboards__empty">
        {{ $t('savedDashboards.empty') }}
      </li>
    </ul>
  </DialogBox>
</template>

<style scoped>
/* ===== Saved Dashboards List ===== */
.saved-dashboards {
  list-style: none;
  padding: 0;
  margin: 0;
}

.saved-dashboards__item {
  margin: 6px 0;
}

/* ===== Dashboard Buttons ===== */
.saved-dashboards__button {
  width: 100%;
  text-align: left;
  padding: 10px 12px;
  border: 1px solid var(--color-shade-3);
  border-radius: 8px;
  background: transparent;
  cursor: pointer;
  transition: border-color 0.2s ease;
}

.saved-dashboards__button:hover {
  border-color: var(--color-primary);
}

/* ===== Dashboard Title & Meta ===== */
.saved-dashboards__title {
  font-weight: 600;
  margin-right: 8px;
}

.saved-dashboards__meta {
  opacity: 0.7;
  font-size: 0.9em;
}

/* ===== Empty State ===== */
.saved-dashboards__empty {
  opacity: 0.7;
}
</style>
