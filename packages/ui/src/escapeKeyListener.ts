/**
 * Attach a keydown listener that only reacts to Escape key events.
 *
 * @param {(event: KeyboardEvent) => void} onEscape - Callback invoked for Escape.
 * @param {{ addEventListener: Function, removeEventListener: Function }} target - Event target.
 * @returns {() => void} Cleanup function removing the listener.
 */
type KeyboardTarget = Pick<Window, "addEventListener" | "removeEventListener">;

export const bindEscapeKeyListener = (
  onEscape: (event: KeyboardEvent) => void,
  target: KeyboardTarget = window,
) => {
  const onKey = (event: KeyboardEvent) => {
    if (event?.code === "Escape") {
      onEscape(event);
    }
  };

  target.addEventListener("keydown", onKey);

  return () => {
    target.removeEventListener("keydown", onKey);
  };
};
