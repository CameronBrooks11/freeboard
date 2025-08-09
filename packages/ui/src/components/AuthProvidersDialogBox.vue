<script setup lang="js">
/**
 * @component AuthProvidersDialogBox
 * @description Modal dialog that displays and manages the list of authentication providers.
 * @prop {Function} onClose - Called when the dialog is closed.
 */
defineOptions({ name: 'AuthProvidersDialogBox' });

import DialogBox from "./DialogBox.vue";
import AuthProvidersList from "./AuthProvidersList.vue";

const { onClose } = defineProps({
  onClose: Function,
});
</script>

<template>
  <DialogBox header="Auth" :cancel="$t('dialogBox.buttonCancel')" @close="onClose">
    <!-- Displays the list of configured auth providers -->
    <AuthProvidersList />
  </DialogBox>
</template>
