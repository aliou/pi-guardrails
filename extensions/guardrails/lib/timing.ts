/**
 * Shared timing utilities for tool and subagent execution.
 */

/** Minimal shape that supports timing fields. */
export interface TimedExecution {
  startedAt?: number;
  endedAt?: number;
  durationMs?: number;
}

/** Mark execution start time (epoch ms). */
export function markExecutionStart<T extends TimedExecution>(
  target: T,
  startedAt = Date.now(),
): T {
  target.startedAt = startedAt;
  return target;
}

/** Mark execution end time and compute duration (epoch ms / ms). */
export function markExecutionEnd<T extends TimedExecution>(
  target: T,
  endedAt = Date.now(),
): T {
  target.endedAt = endedAt;
  if (target.startedAt !== undefined) {
    target.durationMs = Math.max(0, endedAt - target.startedAt);
  }
  return target;
}

/** Simple wall-clock timer for a full operation (e.g., subagent call). */
export function createExecutionTimer(startedAt = Date.now()): {
  startedAt: number;
  getDurationMs: (endedAt?: number) => number;
} {
  return {
    startedAt,
    getDurationMs: (endedAt = Date.now()) => Math.max(0, endedAt - startedAt),
  };
}
