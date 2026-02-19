import renderComponent from "../render.js";
import type { AppContext, Component } from "vue";

export const openModal = (
  component: Component,
  appContext: AppContext,
  props: Record<string, unknown> & { onClose?: (event?: unknown) => void } = {},
) => {
  const el = document.body.appendChild(document.createElement("div"));
  let mounted: { destroy: () => void } | null = null;

  const closeModal = (event?: unknown) => {
    if (props.onClose) {
      props.onClose(event);
    }

    mounted?.destroy?.();
    mounted = null;

    if (el.parentNode) {
      el.parentNode.removeChild(el);
    }
  };

  mounted = renderComponent({
    el,
    component,
    appContext,
    props: {
      ...props,
      onClose: closeModal,
    },
  });

  return {
    close: closeModal,
  };
};
