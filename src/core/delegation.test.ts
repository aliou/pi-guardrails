import { describe, expect, it } from "vitest";
import {
  combineDelegateOutcomes,
  type DelegateOutcome,
  type DelegateVerdict,
  isDelegateAnswer,
} from "./delegation";

function answered(
  name: string,
  verdict: DelegateVerdict,
  reason = `${name} says ${verdict}`,
): DelegateOutcome {
  return {
    delegateId: name,
    delegateName: name,
    status: "answered",
    answer: { verdict, reason },
    elapsedMs: 1,
  };
}

function missing(
  name: string,
  status: Exclude<DelegateOutcome["status"], "answered">,
): DelegateOutcome {
  return { delegateId: name, delegateName: name, status, elapsedMs: 1 };
}

describe("combineDelegateOutcomes", () => {
  it("asks when there are no delegates", () => {
    expect(combineDelegateOutcomes([]).verdict).toBe("ask");
  });

  it("allows only when every delegate allows", () => {
    const result = combineDelegateOutcomes([
      answered("a", "allow"),
      answered("b", "allow"),
    ]);
    expect(result.verdict).toBe("allow");
    expect(result.reason).toBe("a: a says allow; b: b says allow");
  });

  it("blocks when any delegate blocks, even if others allow", () => {
    const result = combineDelegateOutcomes([
      answered("a", "allow"),
      answered("b", "block", "out of scope"),
      answered("c", "ask"),
    ]);
    expect(result).toMatchObject({
      verdict: "block",
      reason: "b: out of scope",
    });
  });

  it("asks when one delegate asks and the rest allow", () => {
    const result = combineDelegateOutcomes([
      answered("a", "allow"),
      answered("b", "ask", "destructive"),
    ]);
    expect(result).toMatchObject({ verdict: "ask", reason: "b: destructive" });
  });

  it.each([
    ["abstained", "b abstained"],
    ["timeout", "b timed out"],
    ["error", "b failed"],
    ["cancelled", "b was cancelled"],
  ] as const)("asks when a delegate %s instead of allowing", (status, reason) => {
    const result = combineDelegateOutcomes([
      answered("a", "allow"),
      missing("b", status),
    ]);
    expect(result).toMatchObject({ verdict: "ask", reason });
  });

  it("explains an explicit ask before a missing answer", () => {
    const result = combineDelegateOutcomes([
      missing("a", "timeout"),
      answered("b", "ask", "unclear"),
    ]);
    expect(result.reason).toBe("b: unclear");
  });

  it("keeps every outcome for the record", () => {
    const outcomes = [answered("a", "allow"), missing("b", "timeout")];
    expect(combineDelegateOutcomes(outcomes).outcomes).toEqual(outcomes);
  });
});

describe("isDelegateAnswer", () => {
  it.each([
    [{ verdict: "allow", reason: "ok" }, true],
    [{ verdict: "block", reason: "" }, true],
    [{ verdict: "maybe", reason: "?" }, false],
    [{ verdict: "allow" }, false],
    [null, false],
    ["allow", false],
  ])("validates %j", (value, expected) => {
    expect(isDelegateAnswer(value)).toBe(expected);
  });
});
