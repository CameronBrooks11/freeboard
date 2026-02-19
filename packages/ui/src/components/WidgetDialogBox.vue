<script setup lang="ts">
/**
 * @component WidgetDialogBox
 * @description Modal dialog for configuring a widget’s type, title, enabled flag, and settings.
 *
 * @prop {string} header       - Title displayed in the dialog header.
 * @prop {Function} onClose    - Callback invoked when the dialog is closed or canceled.
 * @prop {Function} onOk       - Callback invoked with new widget configuration when confirmed.
 * @prop {Object} widget       - Existing widget instance for editing.
 */
defineOptions({ name: "WidgetDialogBox" });

import { computed, ref, watch, type PropType } from "vue";
import DialogBox from "./DialogBox.vue";
import Form from "./Form.vue";
import { useDashboardStore } from "../stores/dashboard.js";
import { usePluginRegistryStore } from "../stores/pluginRegistry.js";
import { storeToRefs } from "pinia";
import TabNavigator from "./TabNavigator.vue";
import TypeSelect from "./TypeSelect.vue";

type FormComponentRef = {
  hasErrors: () => boolean;
  getValue: () => Record<string, unknown>;
};
type WidgetDialogSubmitPayload = {
  type: string | null;
  settings: Record<string, unknown>;
} & Record<string, unknown>;

const dashboardStore = useDashboardStore();
const pluginRegistryStore = usePluginRegistryStore();
const { dashboard } = storeToRefs(dashboardStore);
const { widgetPlugins } = storeToRefs(pluginRegistryStore);

// Props passed from parent component
const { header, onClose, onOk, widget } = defineProps({
  header: String,
  onClose: Function as PropType<(event?: Event) => void>,
  onOk: Function as PropType<(payload: WidgetDialogSubmitPayload) => void>,
  widget: Object as PropType<Record<string, unknown>>,
});

// Reactive reference for selected widget type
const typeRef = ref<string | null>(widget && typeof widget.type === "string" ? widget.type : null);

// Dynamic fields schema based on selected type
const fields = ref<
  Array<{
    name: string;
    settings: Record<string, unknown>;
    fields: Array<Record<string, unknown>>;
  }>
>([]);

// Store child Form component refs for validation
const components = ref<Record<string, FormComponentRef | null>>({});

const isFormComponentRef = (value: unknown): value is FormComponentRef =>
  !!value &&
  typeof value === "object" &&
  typeof (value as FormComponentRef).hasErrors === "function" &&
  typeof (value as FormComponentRef).getValue === "function";

const storeComponentRef = (name: string, el: unknown) => {
  components.value[name] = isFormComponentRef(el) ? el : null;
};

// Rebuild fields whenever widget type changes
watch(
  typeRef,
  (newValue) => {
    const plugin = widgetPlugins.value[newValue];
    if (!newValue || !plugin || typeof plugin.fields !== "function") {
      fields.value = [];
      return;
    }
    fields.value = plugin.fields(widget, dashboard.value, {
      label: "form.labelGeneral",
      icon: "hi-home",
      name: "general",
      settings: {
        title: widget?.title,
        enabled: widget?.enabled,
      },
      fields: [
        {
          name: "title",
          label: "form.labelTitle",
          type: "text",
          required: true,
        },
        {
          name: "enabled",
          label: "form.labelEnabled",
          type: "boolean",
        },
      ],
    });
  },
  { immediate: true },
);

// Build options list for the type select dropdown
const widgetPluginsOptions = computed(() =>
  Object.keys(widgetPlugins.value).map((key) => ({
    value: key,
    label: widgetPlugins.value[key].label,
  })),
);

const dialog = ref<{ closeModal?: () => void } | null>(null);

/**
 * Handle OK: validate all fields, assemble new widget config, invoke onOk, then close modal.
 */
const onDialogBoxOk = () => {
  if (fields.value.some((f) => components.value[f.name]?.hasErrors?.())) {
    return;
  }
  const s: Record<string, unknown> = {};
  const result: Record<string, unknown> = {};
  fields.value.forEach((f) => {
    const v = components.value[f.name]?.getValue?.() || {};
    Object.keys(v).forEach((k) => {
      if (["type", "title", "enabled"].includes(k)) {
        result[k] = v[k];
      } else {
        s[k] = v[k];
      }
    });
  });
  onOk({ ...result, settings: s, type: typeRef.value });
  dialog.value?.closeModal?.();
};
</script>

<template>
  <DialogBox
    :header="header"
    ref="dialog"
    :ok="$t('dialogBox.buttonOk')"
    :cancel="$t('dialogBox.buttonCancel')"
    @close="onClose"
    @ok="() => onDialogBoxOk()"
    class="widget-dialog-box"
  >
    <!-- Type selector in header slot -->
    <template #header>
      <TypeSelect v-model="typeRef" :options="widgetPluginsOptions" />
    </template>
    <!-- Dynamic form tabs for general and type-specific settings -->
    <TabNavigator :fields="fields" v-if="typeRef">
      <template v-for="field in fields" :key="field.name" #[field.name]>
        <Form
          :ref="(el) => storeComponentRef(field.name, el)"
          :settings="field.settings"
          :fields="field.fields"
        />
      </template>
    </TabNavigator>
  </DialogBox>
</template>
