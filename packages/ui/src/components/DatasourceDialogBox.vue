<script setup lang="ts">
/**
 * @component DatasourceDialogBox
 * @description Modal dialog for configuring a datasource plugin and its settings.
 * @prop {string} header        - Title displayed in the dialog header.
 * @prop {Function} onClose     - Callback when the dialog is closed without saving.
 * @prop {Function} onOk        - Callback when the dialog is confirmed with new settings.
 * @prop {Object} datasource    - Existing datasource configuration for editing.
 */
defineOptions({ name: "DatasourceDialogBox" });

import { computed, ref, watch, type PropType } from "vue";
import DialogBox from "./DialogBox.vue";
import Form from "./Form.vue";
import { useDashboardStore } from "../stores/dashboard.js";
import { usePluginRegistryStore } from "../stores/pluginRegistry.js";
import { useProfileCatalogStore } from "../stores/profileCatalog.js";
import { storeToRefs } from "pinia";
import TabNavigator from "./TabNavigator.vue";
import TypeSelect from "./TypeSelect.vue";
import router from "../router";
import type { Router } from "vue-router";
import type { DatasourcePlugin, UnknownRecord } from "../types/runtime.js";

type FormComponentRef = {
  hasErrors: () => boolean;
  getValue: () => Record<string, unknown>;
};
type DatasourceDialogSubmitPayload = {
  type: string | null;
  settings: Record<string, unknown>;
} & Record<string, unknown>;
type DatasourceFieldSection = {
  name: string;
  settings: UnknownRecord;
  fields: UnknownRecord[];
};
type DatasourceLike = {
  id?: string;
  type?: string;
  title?: string;
  enabled?: boolean;
};
const dashboardStore = useDashboardStore();
const pluginRegistryStore = usePluginRegistryStore();
const profileCatalogStore = useProfileCatalogStore();
// Retrieve available datasource plugins and dashboard instance from store
const { dashboard } = storeToRefs(dashboardStore);
const { datasourcePlugins } = storeToRefs(pluginRegistryStore);
const { credentialProfiles, brokerProfiles } = storeToRefs(profileCatalogStore);
const routerTyped = router as Router;
const datasourcePluginMap = computed<Record<string, DatasourcePlugin>>(
  () => datasourcePlugins.value,
);

// Define props passed into this dialog
const { header, onClose, onOk, datasource } = defineProps({
  header: String,
  onClose: Function as PropType<(event?: Event) => void>,
  onOk: Function as PropType<(payload: DatasourceDialogSubmitPayload) => void>,
  datasource: Object as PropType<DatasourceLike>,
});

// Reference to the DialogBox component
const dialog = ref<{ closeModal?: () => void } | null>(null);
// Reference to the TabNavigator component
const tabNavigator = ref<unknown>(null);

// Store refs to child Form components for validation
const components = ref<Record<string, FormComponentRef | null>>({});

const isFormComponentRef = (value: unknown): value is FormComponentRef =>
  !!value &&
  typeof value === "object" &&
  typeof (value as FormComponentRef).hasErrors === "function" &&
  typeof (value as FormComponentRef).getValue === "function";

const storeComponentRef = (name: string, el: unknown) => {
  components.value[name] = isFormComponentRef(el) ? el : null;
};

// Track selected plugin type for the datasource
const typeRef = ref<string | null>(
  datasource && typeof datasource.type === "string" ? datasource.type : null,
);
// Dynamic form fields based on selected plugin
const toDatasourceFieldSection = (value: unknown): DatasourceFieldSection | null => {
  if (!value || typeof value !== "object") {
    return null;
  }
  const candidate = value as Record<string, unknown>;
  const name = typeof candidate.name === "string" ? candidate.name : "";
  if (!name) {
    return null;
  }
  return {
    name,
    settings:
      candidate.settings && typeof candidate.settings === "object"
        ? (candidate.settings as UnknownRecord)
        : {},
    fields: Array.isArray(candidate.fields) ? (candidate.fields as UnknownRecord[]) : [],
  };
};

const fields = ref<DatasourceFieldSection[]>([]);

const validateUniqueDatasourceTitle = (value: unknown) => {
  const candidate = String(value || "").trim();
  if (!candidate) {
    return {};
  }

  const excludeId = datasource ? String(datasource.id || "") || null : null;
  const duplicate = dashboard.value.hasDatasourceTitleConflict(candidate, excludeId);

  return duplicate ? { error: "Datasource title must be unique and not use reserved names." } : {};
};

// Rebuild fields schema whenever the selected type changes
watch(
  [typeRef, credentialProfiles, brokerProfiles],
  ([newValue]) => {
    const selectedType = typeof newValue === "string" ? newValue : "";
    if (!selectedType) {
      fields.value = [];
      return;
    }
    const plugin = datasourcePluginMap.value[selectedType];
    if (!plugin || typeof plugin.fields !== "function") {
      fields.value = [];
      return;
    }
    const sections = plugin.fields?.(
      datasource,
      dashboard.value,
      {
        label: "form.labelGeneral",
        icon: "hi-home",
        name: "general",
        settings: {
          title: datasource?.title,
          enabled: datasource?.enabled,
        },
        fields: [
          {
            name: "title",
            label: "form.labelTitle",
            type: "text",
            required: true,
            validators: [validateUniqueDatasourceTitle],
          },
          {
            name: "enabled",
            label: "form.labelEnabled",
            type: "boolean",
          },
        ],
      },
      {
        credentialProfiles: credentialProfiles.value,
        brokerProfiles: brokerProfiles.value,
      },
    );
    fields.value = Array.isArray(sections)
      ? sections
          .map((section) => toDatasourceFieldSection(section))
          .filter((section): section is DatasourceFieldSection => Boolean(section))
      : [];
  },
  { immediate: true },
);

// Build select options for plugin types
const datasourcePluginsOptions = computed(() =>
  Object.keys(datasourcePluginMap.value)
    .map((key: string) => {
      const plugin = datasourcePluginMap.value[key];
      if (!plugin) {
        return null;
      }
      return {
        value: key,
        label: plugin.label || key,
      };
    })
    .filter((entry): entry is { value: string; label: string } => Boolean(entry)),
);

const showBrokerProfileQuickCreate = computed(
  () => typeRef.value === "mqtt" && brokerProfiles.value.length === 0,
);
const adminBrokerProfilesHref = computed(() => routerTyped.resolve({ path: "/admin" }).href);

const openAdminBrokerProfiles = () => {
  window.open(adminBrokerProfilesHref.value, "_blank", "noopener");
};

/**
 * Confirm dialog: validate fields, assemble new config, invoke onOk, close modal.
 */
const onDialogBoxOk = () => {
  // Prevent saving if any field component reports errors
  if (
    fields.value.some((f) => {
      const name = typeof f.name === "string" ? f.name : "";
      return components.value[name]?.hasErrors?.();
    })
  ) {
    return;
  }
  const s: Record<string, unknown> = {};
  const result: Record<string, unknown> = {};
  fields.value.forEach((f) => {
    const name = typeof f.name === "string" ? f.name : "";
    const v = components.value[name]?.getValue?.() || {};
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
    class="datasource-dialog-box"
    :header="header"
    :ok="$t('dialogBox.buttonOk')"
    :cancel="$t('dialogBox.buttonCancel')"
    ref="dialog"
    @close="onClose"
    @ok="() => onDialogBoxOk()"
  >
    <!-- Plugin type selector in header slot -->
    <template #header>
      <TypeSelect v-model="typeRef" :options="datasourcePluginsOptions" />
    </template>

    <!-- Dynamic form sections for plugin settings -->
    <TabNavigator v-if="typeRef" :fields="fields" ref="tabNavigator">
      <template v-for="field in fields" :key="field.name" #[field.name]>
        <Form
          :ref="(el) => storeComponentRef(field.name, el)"
          :settings="field.settings"
          :fields="field.fields"
        />
      </template>
    </TabNavigator>

    <div v-if="showBrokerProfileQuickCreate" class="datasource-dialog-box__broker-hint">
      <p class="datasource-dialog-box__broker-hint-copy">
        {{ $t("datasourceDialogBox.noBrokerProfilesHint") }}
      </p>
      <button
        type="button"
        class="datasource-dialog-box__broker-hint-action"
        @click="openAdminBrokerProfiles"
      >
        {{ $t("datasourceDialogBox.openAdminBrokerProfiles") }}
      </button>
    </div>
  </DialogBox>
</template>

<style lang="css" scoped>
@import url("../assets/css/components/datasource-dialog-box.css");
</style>
