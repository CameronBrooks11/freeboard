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

import { computed, ref, watch } from "vue";
import DialogBox from "./DialogBox.vue";
import Form from "./Form.vue";
import { useDashboardStore } from "../stores/dashboard.js";
import { usePluginRegistryStore } from "../stores/pluginRegistry.js";
import { useProfileCatalogStore } from "../stores/profileCatalog.js";
import { storeToRefs } from "pinia";
import TabNavigator from "./TabNavigator.vue";
import TypeSelect from "./TypeSelect.vue";
import router from "../router";

const dashboardStore = useDashboardStore();
const pluginRegistryStore = usePluginRegistryStore();
const profileCatalogStore = useProfileCatalogStore();
// Retrieve available datasource plugins and dashboard instance from store
const { dashboard } = storeToRefs(dashboardStore);
const { datasourcePlugins } = storeToRefs(pluginRegistryStore);
const { credentialProfiles, brokerProfiles } = storeToRefs(profileCatalogStore);

// Define props passed into this dialog
const { header, onClose, onOk, datasource } = defineProps({
  header: String,
  onClose: Function,
  onOk: Function,
  datasource: Object,
});

// Reference to the DialogBox component
const dialog = ref(null);
// Reference to the TabNavigator component
const tabNavigator = ref(null);

// Store refs to child Form components for validation
const components = ref({});
const storeComponentRef = (name, el) => {
  components.value[name] = el;
};

// Track selected plugin type for the datasource
const typeRef = ref(datasource ? datasource.type : null);
// Dynamic form fields based on selected plugin
const fields = ref([]);

const validateUniqueDatasourceTitle = (value) => {
  if (!String(value || "").trim()) {
    return {};
  }

  const duplicate = dashboard.value.hasDatasourceTitleConflict(value, datasource?.id);

  return duplicate ? { error: "Datasource title must be unique and not use reserved names." } : {};
};

// Rebuild fields schema whenever the selected type changes
watch(
  [typeRef, credentialProfiles, brokerProfiles],
  ([newValue]) => {
    const plugin = datasourcePlugins.value[newValue];
    if (!newValue || !plugin || typeof plugin.fields !== "function") {
      fields.value = [];
      return;
    }
    fields.value = plugin.fields(
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
  },
  { immediate: true },
);

// Build select options for plugin types
const datasourcePluginsOptions = computed(() =>
  Object.keys(datasourcePlugins.value).map((key) => ({
    value: key,
    label: datasourcePlugins.value[key].label,
  })),
);

const showBrokerProfileQuickCreate = computed(
  () => typeRef.value === "mqtt" && brokerProfiles.value.length === 0,
);
const adminBrokerProfilesHref = computed(() => router.resolve({ path: "/admin" }).href);

const openAdminBrokerProfiles = () => {
  window.open(adminBrokerProfilesHref.value, "_blank", "noopener");
};

/**
 * Confirm dialog: validate fields, assemble new config, invoke onOk, close modal.
 */
const onDialogBoxOk = () => {
  // Prevent saving if any field component reports errors
  if (fields.value.some((f) => components.value[f.name].hasErrors())) {
    return;
  }
  const s = {};
  const result = {};
  fields.value.forEach((f) => {
    const v = components.value[f.name].getValue();
    Object.keys(v).forEach((k) => {
      if (["type", "title", "enabled"].includes(k)) {
        result[k] = v[k];
      } else {
        s[k] = v[k];
      }
    });
  });
  onOk({ ...result, settings: s, type: typeRef.value });
  dialog.value.closeModal();
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
