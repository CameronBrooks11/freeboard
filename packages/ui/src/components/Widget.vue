<script setup lang="js">
/**
 * @component Widget
 * @description Renders a widget instance within a pane and provides edit/delete/move controls in edit mode.
 *
 * @prop {Object} widget - Widget model instance with settings, type, title, enabled flag, and render method.
 */
defineOptions({ name: 'Widget' });

import { storeToRefs } from "pinia";
import { useFreeboardStore } from "../stores/freeboard";
import WidgetDialogBox from "./WidgetDialogBox.vue";
import {
  computed,
  getCurrentInstance,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from "vue";
import ConfirmDialogBox from "./ConfirmDialogBox.vue";
import { useI18n } from "vue-i18n";

const { t } = useI18n();

// Widget instance passed from parent
const { widget } = defineProps({ widget: Object });

const freeboardStore = useFreeboardStore();
const { isEditing, dashboard } = storeToRefs(freeboardStore);

// Reference to the DOM element where the widget will render
const widgetRef = ref(null);
let resizeObserver = null;

const widgetErrorMessage = computed(() => {
  const error = widget.lastError;
  if (!error) {
    return "";
  }

  if (typeof error === "string") {
    return error;
  }

  if (error instanceof Error) {
    return error.message || "Widget runtime error";
  }

  return String(error);
});

/**
 * Open dialog to edit widget settings.
 */
const openWidgetEditDialogBox = () => {
  freeboardStore.createComponent(WidgetDialogBox, instance.appContext, {
    header: t("widget.titleEdit"),
    widget,
    onOk: (newSettings) => {
      if (!newSettings.enabled) {
        widget.enabled = false;
      }

      widget.settings = newSettings.settings;
      widget.type = newSettings.type;
      widget.title = newSettings.title;
      if (newSettings.enabled) {
        widget.enabled = true;
      }
      render();
    },
  });
};

/**
 * Open confirmation dialog to delete widget from its pane.
 */
const openWidgetDeleteDialogBox = () => {
  freeboardStore.createComponent(ConfirmDialogBox, instance.appContext, {
    title: t("widget.titleDelete"),
    onOk: () => {
      dashboard.value.deleteWidget(widget.pane, widget);
    },
  });
};

/**
 * Perform actual widget rendering when enabled and element is available.
 */
const render = () => {
  if (!widget.shouldRender || !widgetRef.value) {
    return;
  }

  widget.render(widgetRef.value);

  widget.onResize({
    width: widgetRef.value.clientWidth,
    height: widgetRef.value.clientHeight,
  });
};

// Render on mount and whenever the dashboard state changes
onMounted(render);
watch(dashboard, render);
watch(() => widget.shouldRender, render);
watch(() => widget.enabled, (enabled) => {
  if (enabled) {
    render();
  }
});

onMounted(() => {
  if (!widgetRef.value || typeof ResizeObserver === "undefined") {
    return;
  }

  resizeObserver = new ResizeObserver((entries) => {
    const entry = entries[0];
    if (!entry) {
      return;
    }

    widget.onResize({
      width: entry.contentRect.width,
      height: entry.contentRect.height,
    });
  });

  resizeObserver.observe(widgetRef.value);
});

onBeforeUnmount(() => {
  if (resizeObserver) {
    resizeObserver.disconnect();
    resizeObserver = null;
  }
});

const instance = getCurrentInstance();
</script>

<template>
  <section class="widget">
    <div class="widget__sub-section">
      <div ref="widgetRef" class="widget__sub-section__widget-output"></div>
      <div v-if="widgetErrorMessage" class="widget__sub-section__widget-error">
        {{ widgetErrorMessage }}
      </div>
      <Transition>
        <ul class="widget__sub-section__board-toolbar" v-if="isEditing">
          <li class="widget__sub-section__board-toolbar__item">
            {{ widget.title }}
          </li>
          <li @click="() => (widget.enabled = !widget.enabled)" class="widget__sub-section__board-toolbar__item">
            <i class="widget__sub-section__board-toolbar__item__icon">
              <v-icon :name="widget.enabled ? 'hi-pause' : 'hi-play'"></v-icon>
            </i>
          </li>
          <li @click="() => widget.pane.moveWidgetUp(widget)" class="widget__sub-section__board-toolbar__item">
            <i class="widget__sub-section__board-toolbar__item__icon">
              <v-icon name="hi-solid-chevron-up"></v-icon>
            </i>
          </li>
          <li @click="() => widget.pane.moveWidgetDown(widget)" class="widget__sub-section__board-toolbar__item">
            <i class="widget__sub-section__board-toolbar__item__icon">
              <v-icon name="hi-solid-chevron-down"></v-icon>
            </i>
          </li>
          <li @click="() => openWidgetEditDialogBox()" class="widget__sub-section__board-toolbar__item">
            <i class="widget__sub-section__board-toolbar__item__icon">
              <v-icon name="hi-solid-cog"></v-icon>
            </i>
          </li>
          <li @click="() => openWidgetDeleteDialogBox()" class="widget__sub-section__board-toolbar__item">
            <i class="widget__sub-section__board-toolbar__item__icon">
              <v-icon name="hi-trash"></v-icon>
            </i>
          </li>
        </ul>
      </Transition>
    </div>
  </section>
</template>

<style lang="css" scoped>
@import url("../assets/css/components/widget.css");
</style>
