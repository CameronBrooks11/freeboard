/**
 * Attach a keydown listener that only reacts to Escape key events.
 *
 * @param {(event: KeyboardEvent) => void} onEscape - Callback invoked for Escape.
 * @param {{ addEventListener: Function, removeEventListener: Function }} target - Event target.
 * @returns {() => void} Cleanup function removing the listener.
 */
export const bindEscapeKeyListener = (onEscape, target = window) => {
  const onKey = (event) => {
    if (event?.code === "Escape") {
      onEscape(event);
    }
  };

  target.addEventListener("keydown", onKey);

  return () => {
    target.removeEventListener("keydown", onKey);
  };
};

