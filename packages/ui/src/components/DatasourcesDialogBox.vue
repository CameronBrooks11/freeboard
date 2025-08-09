<script setup lang="js">
/**
 * @component DatasourcesDialogBox
 * @description Modal dialog that displays and manages the list of datasources.
 * @prop {Function} onClose - Callback when the dialog is closed.
 */
defineOptions({ name: 'DatasourcesDialogBox' });

import DialogBox from "./DialogBox.vue";
import DatasourcesList from "./DatasourcesList.vue";

const { onClose } = defineProps({
  onClose: Function,
});
</script>

<template>
  <DialogBox header="Datasources" cancel="Cancel" @close="onClose">
    <DatasourcesList />
  </DialogBox>
</template>
