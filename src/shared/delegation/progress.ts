import type { DelegateOutcome } from "../../core/delegation";
import type { DelegationRequest } from "./types";

export class DelegationProgress {
  readonly startedAt: number;
  private readonly outcomes: (DelegateOutcome | undefined)[];

  constructor(
    readonly request: DelegationRequest,
    delegateCount: number,
    private readonly timeoutMs: number,
    now = performance.now(),
  ) {
    this.startedAt = now;
    this.outcomes = Array.from({ length: delegateCount }, () => undefined);
  }

  update(index: number, outcome: DelegateOutcome): void {
    this.outcomes[index] = outcome;
  }

  get total(): number {
    return this.outcomes.length;
  }

  get answered(): number {
    return this.outcomes.filter((o) => o !== undefined).length;
  }

  remainingMs(now = performance.now()): number {
    return Math.max(0, this.timeoutMs - (now - this.startedAt));
  }
}
