import { describe, expect, it } from "vitest";
import { DelegationProgress } from "./progress";
import type { DelegationRequest } from "./types";

const request: DelegationRequest = {
  feature: "permissionGate",
  action: { kind: "command", command: "rm -rf build" },
  reason: "recursive force delete",
  toolName: "bash",
  input: {},
};

describe("DelegationProgress", () => {
  it("counts answers as delegates finish", () => {
    const progress = new DelegationProgress(request, 2, 4000);
    expect([progress.answered, progress.total]).toEqual([0, 2]);
    progress.update(1, {
      delegateId: "c",
      delegateName: "classifier",
      status: "answered",
      answer: { verdict: "allow", reason: "in scope" },
      elapsedMs: 180,
    });
    expect([progress.answered, progress.total]).toEqual([1, 2]);
  });

  it("counts down to the timeout and stops at zero", () => {
    const progress = new DelegationProgress(request, 1, 4000, 0);
    expect(progress.remainingMs(1500)).toBe(2500);
    expect(progress.remainingMs(9000)).toBe(0);
  });
});
