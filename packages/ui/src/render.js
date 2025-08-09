/**
 * @module render
 * @description Dynamically render and manage Vue components outside of template context.
 */

import { createVNode, render } from "vue";

/**
 * Render a Vue component into a DOM element and provide a cleanup function.
 *
 * @param {Object} options
 * @param {Element} options.el - DOM element to mount the component into.
 * @param {import('vue').Component} options.component - Vue component definition.
 * @param {import('vue').AppContext} options.appContext - Vue application context.
 * @param {Object} [options.props] - Props object to pass to the component.
 * @returns {{ vnode: import('vue').VNode, destroy: () => void }} An object containing the vnode and a destroy method.
 */
export default function renderComponent({ el, component, appContext, props }) {
  let vnode = createVNode(component, props);
  vnode.appContext = { ...appContext };
  render(vnode, el);

  return {
    vnode,
    destroy: () => {
      // Unmount the component and clear the vnode reference
      render(null, el);
      vnode = undefined;
    },
  };
}
