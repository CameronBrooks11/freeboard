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
import { normalizeDashboardTheme } from "../models/Dashboard.js";
import { DASHBOARD_THEME_CATALOG, type DashboardThemeCatalogEntry } from "../ui/themeCatalog.js";
import {
  UI_LOCALE_AUTO,
  getUiLocaleSelection,
  normalizeUiLocaleSelection,
  resolveUiLocaleFromSelection,
  setUiLocaleSelection,
  type UiLocaleSelection,
} from "../i18n/index.js";

type FormComponentRef = {
  hasErrors: () => boolean;
  getValue: () => Record<string, unknown>;
  setFieldValue?: (fieldName: string, value: unknown) => void;
};
type SettingsDialogSubmitPayload = Record<string, unknown> & {
  settings: Record<string, unknown>;
};
type SettingsSection = {
  name: string;
  settings: Record<string, unknown>;
  fields: Array<Record<string, unknown>>;
};

const authStore = useAuthStore();
const dashboardStore = useDashboardStore();
const { dashboard } = storeToRefs(dashboardStore);

// Store child form component refs for validation
const components = ref<Record<string, FormComponentRef | null>>({});

const isFormComponentRef = (value: unknown): value is FormComponentRef =>
  !!value &&
  typeof value === "object" &&
  typeof (value as FormComponentRef).hasErrors === "function" &&
  typeof (value as FormComponentRef).getValue === "function";

const storeComponentRef = (name: string, el: unknown) => {
  components.value[name] = isFormComponentRef(el) ? el : null;
};

// Props passed from parent
const { onClose, onOk, onThemePreviewChange } = defineProps({
  onClose: Function as PropType<(event?: Event) => void>,
  onOk: Function as PropType<(payload: SettingsDialogSubmitPayload) => void>,
  onThemePreviewChange: Function as PropType<(themeValue: string) => void>,
});

// Compute tab fields schema from current dashboard settings
const fields = computed<SettingsSection[]>(
  () =>
    createSettings(dashboard.value, {
      allowTrustedExecution: authStore.isTrustedExecutionMode(),
    }) as SettingsSection[],
);

const preferredColorScheme = usePreferredColorScheme();

const selectedTheme = ref(normalizeDashboardTheme(dashboard.value?.settings?.theme));
const selectedUiLocale = ref<UiLocaleSelection>(normalizeUiLocaleSelection(getUiLocaleSelection()));

const uiLocaleLabelKeyMap: Record<string, string> = {
  en: "form.labelLanguageEnglish",
  fr: "form.labelLanguageFrench",
  es: "form.labelLanguageSpanish",
  de: "form.labelLanguageGerman",
};

watch(
  () => dashboard.value?.settings?.theme,
  (themeValue) => {
    selectedTheme.value = normalizeDashboardTheme(themeValue);
  },
  { immediate: true },
);

const onFormChange = (sectionName: string, formValue: unknown) => {
  if (sectionName === "theme") {
    const nextValue =
      formValue && typeof formValue === "object"
        ? (formValue as Record<string, unknown>).theme
        : undefined;
    selectedTheme.value = normalizeDashboardTheme(nextValue);
    onThemePreviewChange?.(selectedTheme.value);
    return;
  }

  if (sectionName === "language") {
    const nextValue =
      formValue && typeof formValue === "object"
        ? (formValue as Record<string, unknown>).uiLocale
        : undefined;
    selectedUiLocale.value = normalizeUiLocaleSelection(nextValue);
    setUiLocaleSelection(selectedUiLocale.value);
  }
};

const onThemePreviewSelect = (themeValue: string) => {
  selectedTheme.value = normalizeDashboardTheme(themeValue);
  components.value.theme?.setFieldValue?.("theme", selectedTheme.value);
  onThemePreviewChange?.(selectedTheme.value);
};

const resolvedAutoThemeLabel = computed(() =>
  preferredColorScheme.value === "dark" ? "form.labelThemeDark" : "form.labelThemeLight",
);

const themePreviewCards = computed(() =>
  DASHBOARD_THEME_CATALOG.map((preview: DashboardThemeCatalogEntry) => ({
    ...preview,
    selected: selectedTheme.value === preview.value,
  })),
);

const resolvedAutoUiLocaleLabel = computed(() => {
  const resolvedLocale = resolveUiLocaleFromSelection(UI_LOCALE_AUTO);
  return uiLocaleLabelKeyMap[resolvedLocale] || "form.labelLanguageEnglish";
});

// Reference to the DialogBox for closing the modal programmatically
const dialog = ref<{ closeModal?: () => void } | null>(null);

/**
 * Handle OK: validate all tabs, assemble general and settings objects, invoke onOk, then close modal.
 */
const onDialogBoxOk = () => {
  // Prevent save if any field component reports errors
  if (fields.value.some((f) => components.value[f.name]?.hasErrors?.())) {
    return;
  }
  const s: Record<string, unknown> = {};
  const result: Record<string, unknown> = {};
  fields.value.forEach((f) => {
    const v = components.value[f.name]?.getValue?.() || {};
    Object.keys(v).forEach((k) => {
      if (f.name === "general") {
        result[k] = v[k];
      } else {
        s[k] = v[k];
      }
    });
  });
  onOk?.({ ...result, settings: s });
  dialog.value?.closeModal?.();
};
</script>

<template>
  <DialogBox
    :header="$t('dialogBox.titleSettings')"
    ref="dialog"
    :ok="$t('dialogBox.buttonApply')"
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
            {{ $t("settings.themePreviewTitle") }}
            <span
              v-if="selectedTheme === 'auto'"
              class="settings-dialog-theme-preview__auto-caption"
            >
              ({{
                $t("settings.themePreviewAutoResolves", {
                  theme: $t(resolvedAutoThemeLabel),
                })
              }})
            </span>
          </div>
          <div class="settings-dialog-theme-preview__hint">
            {{ $t("settings.themePreviewHint") }}
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
                  v-for="swatch in theme.previewSwatches"
                  :key="`${theme.value}-${swatch}`"
                  class="settings-dialog-theme-preview__swatch"
                  :style="{ backgroundColor: swatch }"
                />
              </div>
              <div class="settings-dialog-theme-preview__label">{{ $t(theme.labelKey) }}</div>
            </button>
          </div>
        </div>
        <div v-if="field.name === 'language'" class="settings-dialog-locale-preview">
          <div class="settings-dialog-locale-preview__heading">
            {{ $t("settings.localePreviewTitle") }}
            <span
              v-if="selectedUiLocale === UI_LOCALE_AUTO"
              class="settings-dialog-locale-preview__auto-caption"
            >
              ({{
                $t("settings.localePreviewAutoResolves", {
                  locale: $t(resolvedAutoUiLocaleLabel),
                })
              }})
            </span>
          </div>
          <div class="settings-dialog-locale-preview__hint">
            {{ $t("settings.localePreviewHint") }}
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
  margin-bottom: 4px;
  letter-spacing: 0.04em;
}

.settings-dialog-theme-preview__auto-caption {
  font-weight: 400;
  text-transform: none;
  letter-spacing: normal;
  margin-left: 6px;
}

.settings-dialog-theme-preview__hint {
  color: var(--color-shade-7);
  font-size: 12px;
  margin-bottom: 8px;
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

.settings-dialog-locale-preview {
  margin-top: 12px;
  border: 1px solid var(--color-shade-3);
  padding: 10px;
  background: var(--color-shade-1);
}

.settings-dialog-locale-preview__heading {
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  color: var(--color-shade-8);
  margin-bottom: 4px;
  letter-spacing: 0.04em;
}

.settings-dialog-locale-preview__auto-caption {
  font-weight: 400;
  text-transform: none;
  letter-spacing: normal;
  margin-left: 6px;
}

.settings-dialog-locale-preview__hint {
  color: var(--color-shade-7);
  font-size: 12px;
}
</style>
