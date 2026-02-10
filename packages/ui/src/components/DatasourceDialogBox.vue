<script setup lang="js">
/**
 * @component DatasourceDialogBox
 * @description Modal dialog for configuring a datasource plugin and its settings.
 * @prop {string} header        - Title displayed in the dialog header.
 * @prop {Function} onClose     - Callback when the dialog is closed without saving.
 * @prop {Function} onOk        - Callback when the dialog is confirmed with new settings.
 * @prop {Object} datasource    - Existing datasource configuration for editing.
 */
defineOptions({ name: 'DatasourceDialogBox' });

import { computed, ref, watch } from "vue";
import DialogBox from "./DialogBox.vue";
import Form from "./Form.vue";
import { useFreeboardStore } from "../stores/freeboard";
import { storeToRefs } from "pinia";
import TabNavigator from "./TabNavigator.vue";
import TypeSelect from "./TypeSelect.vue";

const freeboardStore = useFreeboardStore();
// Retrieve available datasource plugins and dashboard instance from store
const { datasourcePlugins, dashboard } = storeToRefs(freeboardStore);

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

  const duplicate = dashboard.value.hasDatasourceTitleConflict(
    value,
    datasource?.id
  );

  return duplicate
    ? { error: "Datasource title must be unique and not use reserved names." }
    : {};
};

// Rebuild fields schema whenever the selected type changes
watch(
  typeRef,
  (newValue) => {
    if (!newValue) {
      fields.value = [];
      return;
    }
    fields.value = datasourcePlugins.value[newValue].fields(
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
      }
    );
  },
  { immediate: true }
);

// Build select options for plugin types
const datasourcePluginsOptions = computed(() =>
  Object.keys(datasourcePlugins.value).map((key) => ({
    value: key,
    label: datasourcePlugins.value[key].label,
  }))
);

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
  <DialogBox class="datasource-dialog-box" :header="header" :ok="$t('dialogBox.buttonOk')"
    :cancel="$t('dialogBox.buttonCancel')" ref="dialog" @close="onClose" @ok="() => onDialogBoxOk()">
    <!-- Plugin type selector in header slot -->
    <template #header>
      <TypeSelect v-model="typeRef" :options="datasourcePluginsOptions" />
    </template>

    <!-- Dynamic form sections for plugin settings -->
    <TabNavigator v-if="typeRef" :fields="fields" ref="tabNavigator">
      <template v-for="field in fields" :key="field.name" #[field.name]>
        <Form :ref="(el) => storeComponentRef(field.name, el)" :settings="field.settings" :fields="field.fields" />
      </template>
    </TabNavigator>
  </DialogBox>
</template>

<style lang="css" scoped>
@import url("../assets/css/components/datasource-dialog-box.css");
</style>
