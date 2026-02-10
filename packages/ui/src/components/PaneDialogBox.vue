<script setup lang="js">
/**
 * @component PaneDialogBox
 * @description Modal dialog for editing a pane’s title.
 *
 * @prop {string} header     - Title displayed in the dialog header.
 * @prop {Function} onClose  - Callback invoked when the dialog is closed or canceled.
 * @prop {Function} onOk     - Callback invoked with new settings when confirmed.
 * @prop {Object} settings   - Initial settings object containing the pane name.
 */
defineOptions({ name: 'PaneDialogBox' });

import { onMounted, ref } from "vue";
import DialogBox from "./DialogBox.vue";
import Form from "./Form.vue";
import { useI18n } from "vue-i18n";

const { t } = useI18n();

// Reference to the Form component for validation and value retrieval
const form = ref(null);
// Dynamic form fields for editing pane name
const fields = ref([]);

// Props passed from parent component
const { header, onClose, onOk, settings } = defineProps({
  header: String,
  onClose: Function,
  onOk: Function,
  settings: Object,
});

// Initialize form fields on mount
onMounted(() => {
  const data = [
    {
      name: "name",
      label: t("form.labelName"),
      type: "text",
    },
  ];
  
  fields.value = data;
});

// Reference to the DialogBox for closing the modal programmatically
const dialog = ref(null);

/**
 * Handle the OK button: validate form, invoke onOk prop with new settings, then close modal.
 */
const onDialogBoxOk = () => {
  if (form.value.hasErrors()) {
    return;
  }
  onOk({ settings: form.value.getValue() });
  dialog.value.closeModal();
};
</script>

<template>
  <DialogBox :header="header" ref="dialog" :ok="$t('dialogBox.buttonOk')" :cancel="$t('dialogBox.buttonCancel')"
    @close="onClose" @ok="() => onDialogBoxOk()">
    <!-- Form for editing pane title -->
    <Form ref="form" :settings="settings" :fields="fields" />
  </DialogBox>
</template>
