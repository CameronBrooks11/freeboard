<script setup lang="ts">
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
defineOptions({ name: "DialogBox" });

import { nextTick, onBeforeUnmount, onDeactivated, onMounted, ref, useId } from "vue";
import TextButton from "./TextButton.vue";
import { bindEscapeKeyListener } from "../escapeKeyListener";

const show = ref(false);
const modalRef = ref<HTMLElement | null>(null);

// Unique id per instance so aria-labelledby resolves even if dialogs ever stack.
const titleId = useId();

const emit = defineEmits(["ok", "cancel", "close"]);

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

const getFocusable = (): HTMLElement[] => {
  const root = modalRef.value;
  if (!root) {
    return [];
  }
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (el) => el.offsetParent !== null || el === document.activeElement,
  );
};

// Element that had focus before the dialog opened, so it can be restored on close.
let previouslyFocused: HTMLElement | null = null;

// Trap Tab within the modal (WAI-ARIA modal dialog pattern): wrap at both ends,
// and pull focus back in if it has escaped.
const onModalKeydown = (event: KeyboardEvent) => {
  if (event.key !== "Tab") {
    return;
  }
  const focusable = getFocusable();
  const active = document.activeElement as HTMLElement | null;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (!first || !last) {
    event.preventDefault();
    modalRef.value?.focus();
    return;
  }
  const outside = !modalRef.value?.contains(active);
  if (event.shiftKey && (active === first || outside)) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && (active === last || outside)) {
    event.preventDefault();
    first.focus();
  }
};

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
const onOk = (event: Event) => {
  emit("ok", event);
};

/**
 * Handle Cancel button click: emit 'cancel' and close the modal.
 *
 * @param {Event} event - Click event.
 */
const onCancel = (event: Event) => {
  emit("cancel", event);
  closeModal();
};

let unbindEscapeListener = () => {};

onMounted(() => {
  previouslyFocused = (document.activeElement as HTMLElement) ?? null;
  show.value = true;
  unbindEscapeListener = bindEscapeKeyListener(onCancel, window);
  // Move focus into the dialog once it has rendered (first field, or the dialog
  // itself as a fallback), so keyboard and screen-reader users start inside it.
  void nextTick(() => {
    const focusable = getFocusable();
    (focusable[0] ?? modalRef.value)?.focus();
  });
});

const restoreFocus = () => {
  previouslyFocused?.focus?.();
  previouslyFocused = null;
};

onBeforeUnmount(() => {
  unbindEscapeListener();
  restoreFocus();
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
    <div v-if="show" class="dialog-box" @keydown="onModalKeydown">
      <div
        ref="modalRef"
        class="dialog-box__modal"
        role="dialog"
        aria-modal="true"
        :aria-labelledby="header ? titleId : undefined"
        tabindex="-1"
      >
        <header class="dialog-box__modal__header">
          <h2 :id="header ? titleId : undefined">{{ header }}</h2>
          <slot name="header"></slot>
        </header>
        <section class="dialog-box__modal__content">
          <form id="form" @submit.prevent="onOk">
            <slot />
          </form>
        </section>
        <footer class="dialog-box__modal__footer">
          <slot name="footer"></slot>
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
