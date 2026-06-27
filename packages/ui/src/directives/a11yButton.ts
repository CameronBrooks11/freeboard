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

const isSpace = (event: KeyboardEvent) => event.key === " " || event.key === "Spacebar";

// Match the native button activation pattern: Enter activates on keydown; Space
// is prevented on keydown (to stop page scroll and key-repeat) and activates on
// keyup, so holding the key doesn't fire repeatedly and moving focus away cancels.
const onKeydown = (event: KeyboardEvent) => {
  if (event.key === "Enter") {
    event.preventDefault();
    (event.currentTarget as HTMLElement).click();
  } else if (isSpace(event)) {
    event.preventDefault();
  }
};

const onKeyup = (event: KeyboardEvent) => {
  if (isSpace(event)) {
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
    el.addEventListener("keyup", onKeyup);
  },
  unmounted(el) {
    el.removeEventListener("keydown", onKeydown);
    el.removeEventListener("keyup", onKeyup);
  },
};
