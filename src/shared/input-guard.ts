/** Default quiet period, in milliseconds, before a prompt accepts an answer. */
export const DEFAULT_INPUT_GUARD_MS = 1000;

/**
 * Returns a function to call on every keypress. It reports whether input was
 * quiet for `quietMs` beforehand, so keys typed for the editor can't answer a
 * prompt that just opened. Every call restarts the window; 0 disables.
 */
export function createInputGuard(
  quietMs: number = DEFAULT_INPUT_GUARD_MS,
): () => boolean {
  let lastActivity = performance.now();
  return () => {
    const now = performance.now();
    const armed = now - lastActivity >= quietMs;
    lastActivity = now;
    return armed;
  };
}
