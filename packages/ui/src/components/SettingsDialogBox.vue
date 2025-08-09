<script setup lang="js">
/**
 * @component SettingsDialogBox
 * @description Modal dialog for editing dashboard settings (general, theme, style, etc.) via tabs.
 *
 * @prop {Function} onClose - Callback when the dialog is canceled or closed.
 * @prop {Function} onOk    - Callback invoked with updated settings and general fields.
 */
defineOptions({ name: 'SettingsDialogBox' });

import { computed, ref } from "vue";
import DialogBox from "./DialogBox.vue";
import Form from "./Form.vue";
import { useFreeboardStore } from "../stores/freeboard";
import { storeToRefs } from "pinia";
import TabNavigator from "./TabNavigator.vue";
import createSettings from "../settings";

const freeboardStore = useFreeboardStore();

const { dashboard } = storeToRefs(freeboardStore);

// Store child form component refs for validation
const components = ref({});

const storeComponentRef = (name, el) => {
  components.value[name] = el;
};

// Props passed from parent
const { onClose, onOk } = defineProps({
  onClose: Function,
  onOk: Function,
});

// Compute tab fields schema from current dashboard settings
const fields = computed(() => createSettings(dashboard.value));

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
  const s = {};
  const result = {};
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
  onOk({ ...result, settings: s });
  dialog.value.closeModal();
};
</script>

<template>
  <DialogBox :header="$t('dialogBox.titleSettings')" ref="dialog" :ok="$t('dialogBox.buttonOk')"
    :cancel="$t('dialogBox.buttonCancel')" @close="onClose" @ok="onDialogBoxOk">
    <!-- Tabbed sections for each settings category -->
    <TabNavigator :fields="fields">
      <template v-slot:[field.name] v-for="field in fields">
        <Form :ref="(el) => storeComponentRef(field.name, el)" :settings="field.settings" :fields="field.fields" />
      </template>
    </TabNavigator>
  </DialogBox>
</template>
