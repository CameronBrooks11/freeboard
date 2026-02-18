<script setup lang="ts">
/**
 * @component SettingsDialogBox
 * @description Modal dialog for editing dashboard settings (general, theme, style, etc.) via tabs.
 *
 * @prop {Function} onClose - Callback when the dialog is canceled or closed.
 * @prop {Function} onOk    - Callback invoked with updated settings and general fields.
 */
defineOptions({ name: "SettingsDialogBox" });

import { computed, ref, watch, type PropType } from "vue";
import DialogBox from "./DialogBox.vue";
import Form from "./Form.vue";
import { useAuthStore } from "../stores/auth.js";
import { useDashboardStore } from "../stores/dashboard.js";
import { storeToRefs } from "pinia";
import TabNavigator from "./TabNavigator.vue";
import createSettings from "../settings";
import { usePreferredColorScheme } from "@vueuse/core";

const authStore = useAuthStore();
const dashboardStore = useDashboardStore();
const { dashboard } = storeToRefs(dashboardStore);

// Store child form component refs for validation
const components = ref<Record<string, any>>({});

const storeComponentRef = (name: string, el: any) => {
  components.value[name] = el;
};

// Props passed from parent
const { onClose, onOk } = defineProps({
  onClose: Function as PropType<() => any>,
  onOk: Function as PropType<() => any>,
});

// Compute tab fields schema from current dashboard settings
const fields = computed(() =>
  createSettings(dashboard.value, {
    allowTrustedExecution: authStore.isTrustedExecutionMode(),
  }),
);

const preferredColorScheme = usePreferredColorScheme();

const THEME_PREVIEWS = Object.freeze([
  {
    value: "auto",
    label: "form.labelThemeAuto",
    swatches: ["#9ca3af", "#d1d5db", "#374151"],
  },
  {
    value: "light",
    label: "form.labelThemeLight",
    swatches: ["#ffffff", "#a1a1a1", "#b87051"],
  },
  {
    value: "dark",
    label: "form.labelThemeDark",
    swatches: ["#101214", "#363636", "#b88f51"],
  },
  {
    value: "professional",
    label: "form.labelThemeProfessional",
    swatches: ["#111827", "#334155", "#2563eb"],
  },
  {
    value: "high-contrast",
    label: "form.labelThemeHighContrast",
    swatches: ["#000000", "#ffffff", "#ffff00"],
  },
  {
    value: "colorblind",
    label: "form.labelThemeColorblind",
    swatches: ["#0f172a", "#0072b2", "#e69f00"],
  },
  {
    value: "warm",
    label: "form.labelThemeWarm",
    swatches: ["#1c1917", "#f59e0b", "#c2410c"],
  },
  {
    value: "cool",
    label: "form.labelThemeCool",
    swatches: ["#0b1120", "#06b6d4", "#2563eb"],
  },
]);

const selectedTheme = ref(dashboard.value?.settings?.theme || "auto");

watch(
  () => dashboard.value?.settings?.theme,
  (themeValue) => {
    selectedTheme.value = String(themeValue || "auto");
  },
  { immediate: true },
);

const onFormChange = (sectionName: string, formValue: any) => {
  if (sectionName !== "theme") {
    return;
  }
  selectedTheme.value = String(formValue?.theme || "auto");
};

const onThemePreviewSelect = (themeValue: string) => {
  selectedTheme.value = themeValue;
  components.value.theme?.setFieldValue?.("theme", themeValue);
};

const resolvedAutoThemeLabel = computed(() =>
  preferredColorScheme.value === "dark" ? "form.labelThemeDark" : "form.labelThemeLight",
);

const themePreviewCards = computed(() =>
  THEME_PREVIEWS.map((preview) => ({
    ...preview,
    selected: selectedTheme.value === preview.value,
  })),
);

// Reference to the DialogBox for closing the modal programmatically
const dialog = ref(null);

/**
 * Handle OK: validate all tabs, assemble general and settings objects, invoke onOk, then close modal.
 */
const onDialogBoxOk = () => {
  // Prevent save if any field component reports errors
  if (fields.value.some((f) => components.value[f.name].hasErrors())) {
    return;
  }
  const s: Record<string, any> = {};
  const result: Record<string, any> = {};
  fields.value.forEach((f) => {
    const v = components.value[f.name].getValue();
    Object.keys(v).forEach((k) => {
      if (f.name === "general") {
        result[k] = v[k];
      } else {
        s[k] = v[k];
      }
    });
  });
  (onOk as any)({ ...result, settings: s });
  dialog.value.closeModal();
};
</script>

<template>
  <DialogBox
    :header="$t('dialogBox.titleSettings')"
    ref="dialog"
    :ok="$t('dialogBox.buttonOk')"
    :cancel="$t('dialogBox.buttonCancel')"
    @close="onClose"
    @ok="onDialogBoxOk"
  >
    <!-- Tabbed sections for each settings category -->
    <TabNavigator :fields="fields">
      <template v-for="field in fields" :key="field.name" #[field.name]>
        <Form
          :ref="(el) => storeComponentRef(field.name, el)"
          :settings="field.settings"
          :fields="field.fields"
          @change="(value) => onFormChange(field.name, value)"
        />
        <div v-if="field.name === 'theme'" class="settings-dialog-theme-preview">
          <div class="settings-dialog-theme-preview__heading">
            Theme Preview
            <span
              v-if="selectedTheme === 'auto'"
              class="settings-dialog-theme-preview__auto-caption"
            >
              (Auto resolves to {{ $t(resolvedAutoThemeLabel) }})
            </span>
          </div>
          <div class="settings-dialog-theme-preview__grid">
            <button
              type="button"
              v-for="theme in themePreviewCards"
              :key="theme.value"
              class="settings-dialog-theme-preview__card"
              :class="{
                'settings-dialog-theme-preview__card--selected': theme.selected,
              }"
              @click="onThemePreviewSelect(theme.value)"
            >
              <div class="settings-dialog-theme-preview__swatches">
                <span
                  v-for="swatch in theme.swatches"
                  :key="`${theme.value}-${swatch}`"
                  class="settings-dialog-theme-preview__swatch"
                  :style="{ backgroundColor: swatch }"
                />
              </div>
              <div class="settings-dialog-theme-preview__label">{{ $t(theme.label) }}</div>
            </button>
          </div>
        </div>
      </template>
    </TabNavigator>
  </DialogBox>
</template>

<style scoped>
.settings-dialog-theme-preview {
  margin-top: 12px;
  border: 1px solid var(--color-shade-3);
  padding: 10px;
  background: var(--color-shade-1);
}

.settings-dialog-theme-preview__heading {
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  color: var(--color-shade-8);
  margin-bottom: 8px;
  letter-spacing: 0.04em;
}

.settings-dialog-theme-preview__auto-caption {
  font-weight: 400;
  text-transform: none;
  letter-spacing: normal;
  margin-left: 6px;
}

.settings-dialog-theme-preview__grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(135px, 1fr));
  gap: 8px;
}

.settings-dialog-theme-preview__card {
  border: 1px solid var(--color-shade-3);
  background: var(--color-shade-0);
  color: var(--color-foreground);
  padding: 8px;
  text-align: left;
  cursor: pointer;
}

.settings-dialog-theme-preview__card:hover {
  border-color: var(--color-primary);
}

.settings-dialog-theme-preview__card--selected {
  border-color: var(--color-primary);
  box-shadow: 0 0 0 1px var(--color-primary) inset;
}

.settings-dialog-theme-preview__swatches {
  display: flex;
  gap: 4px;
  margin-bottom: 6px;
}

.settings-dialog-theme-preview__swatch {
  width: 20px;
  height: 12px;
  border: 1px solid var(--color-shade-4);
}

.settings-dialog-theme-preview__label {
  font-size: 12px;
}
</style>
