import renderComponent from "../render.js";

export const openModal = (component: any, appContext: any, props: any = {}) => {
  const el = document.body.appendChild(document.createElement("div"));
  let mounted = null;

  const closeModal = (event) => {
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
