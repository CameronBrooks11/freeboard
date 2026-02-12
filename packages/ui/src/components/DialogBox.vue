<script setup lang="js">
/**
 * @component DialogBox
 * @description Generic modal dialog with header slot, content slot, and footer with OK/Cancel controls.
 *
 * @prop {string} header - Title displayed in the dialog header.
 * @prop {string} ok - Label for the OK button (triggers form submit).
 * @prop {string} cancel - Label for the Cancel button.
 * @prop {boolean} okDisabled - Disables the OK button when true.
 *
 * @emits ok - Emitted when the OK button is clicked or the form is submitted.
 * @emits cancel - Emitted when the Cancel button is clicked.
 * @emits close - Emitted when the dialog is closed (including on Escape key).
 */
defineOptions({ name: 'DialogBox' });

import { onBeforeUnmount, onDeactivated, onMounted, ref } from "vue";
import TextButton from "./TextButton.vue";
import { bindEscapeKeyListener } from "../escapeKeyListener";

const show = ref(false);

const emit = defineEmits(["ok", "cancel", "close"]);

/**
 * Close the modal and emit 'close'.
 */
const closeModal = () => {
  show.value = false;
  emit("close");
};

/**
 * Emit 'ok' when form is submitted.
 *
 * @param {Event} event - Submit or click event.
 */
const onOk = (event) => {
  emit("ok", event);
};

/**
 * Handle Cancel button click: emit 'cancel' and close the modal.
 *
 * @param {Event} event - Click event.
 */
const onCancel = (event) => {
  emit("cancel", event);
  closeModal();
};

let unbindEscapeListener = () => {};

onMounted(() => {
  show.value = true;
  unbindEscapeListener = bindEscapeKeyListener(onCancel, window);
});

onBeforeUnmount(() => {
  unbindEscapeListener();
});

onDeactivated(() => {
  unbindEscapeListener();
});

const { header, ok, cancel, okDisabled } = defineProps({
  header: String,
  ok: String,
  cancel: String,
  okDisabled: Boolean,
});

defineExpose({
  closeModal,
});
</script>

<template>
  <Transition>
    <div v-if="show" class="dialog-box">
      <div class="dialog-box__modal">
        <header class="dialog-box__modal__header">
          <h2>{{ header }}</h2>
          <slot name="header"></slot>
        </header>
        <section class="dialog-box__modal__content">
          <form id="form" @submit.prevent="onOk">
            <slot />
          </form>
        </section>
        <footer class="dialog-box__modal__footer">
          <TextButton :disabled="okDisabled" v-if="ok" type="submit" form="form" @click="onOk">
            {{ ok }}
          </TextButton>
          <TextButton v-if="cancel" @click="onCancel">
            {{ cancel }}
          </TextButton>
        </footer>
      </div>
    </div>
  </Transition>
</template>

<style lang="css" scoped>
@import url("../assets/css/components/dialog-box.css");
</style>
