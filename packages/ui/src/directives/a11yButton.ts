import type { Directive } from "vue";

/**
 * @module directives/a11yButton
 * @description Makes a non-interactive element (a clickable `<li>`/`<div>`/`<i>`)
 * keyboard-operable as a button: it becomes focusable, is exposed to assistive
 * tech as a button, and activates on Enter/Space. The element keeps its existing
 * `@click` handler — Enter/Space synthesize a native click, so pointer and
 * keyboard both go through the same path. Pair with an `aria-label` on icon-only
 * controls so the button has an accessible name.
 */

const onKeydown = (event: KeyboardEvent) => {
  if (event.key === "Enter" || event.key === " " || event.key === "Spacebar") {
    // Prevent Space from scrolling the page and Enter from submitting a form.
    event.preventDefault();
    (event.currentTarget as HTMLElement).click();
  }
};

export const a11yButton: Directive<HTMLElement> = {
  mounted(el) {
    if (!el.hasAttribute("role")) {
      el.setAttribute("role", "button");
    }
    if (!el.hasAttribute("tabindex")) {
      el.setAttribute("tabindex", "0");
    }
    el.addEventListener("keydown", onKeydown);
  },
  unmounted(el) {
    el.removeEventListener("keydown", onKeydown);
  },
};
