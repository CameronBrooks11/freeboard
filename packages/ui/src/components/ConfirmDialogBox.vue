<script setup lang="js">
/**
 * @component ConfirmDialogBox
 * @description Modal dialog prompting the user to confirm an action.
 * @prop {string} title - The action description to include in the confirmation message.
 * @prop {Function} onClose - Callback invoked when the dialog is canceled or closed.
 * @prop {Function} onOk - Callback invoked when the user confirms the action.
 */
defineOptions({ name: 'ConfirmDialogBox' });

import { ref } from "vue";
import DialogBox from "./DialogBox.vue";

const dialog = ref(null);

const { title, onClose, onOk } = defineProps({
  title: String,
  onClose: Function,
  onOk: Function,
});

/**
 * Handle the OK button: invoke onOk and close the modal.
 */
const onDialogBoxOk = () => {
  onOk();
  dialog.value.closeModal();
};
</script>

<template>
  <DialogBox :header="$t('dialogBox.titleConfirm')" :ok="$t('dialogBox.buttonOk')"
    :cancel="$t('dialogBox.buttonCancel')" @close="onClose" @ok="onDialogBoxOk" ref="dialog">
    <!-- Confirmation message including the action title -->
    <p>Are you sure you want to {{ title }}?</p>
  </DialogBox>
</template>
