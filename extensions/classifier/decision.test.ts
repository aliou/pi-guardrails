import { describe, expect, it } from "vitest";
import { type ClassifierOutcome, decide } from "./decision";

type FactsInput = {
  sufficiency?: number;
  authorization?: string;
  authorizationProbability?: number;
  impact?: number;
  impactConfidence?: number;
  stopReason?: string;
  errorMessage?: string;
};

function facts({
  sufficiency = 0.95,
  authorization = "in_scope",
  authorizationProbability = 0.95,
  impact = 1.5,
  impactConfidence = 0.9,
  stopReason = "stop",
  errorMessage,
}: FactsInput = {}): ClassifierOutcome {
  return {
    stopReason,
    ...(errorMessage ? { errorMessage } : {}),
    answers: {
      context_sufficiency: { type: "bool", probability: sufficiency },
      authorization: {
        type: "choice",
        choice: authorization,
        probabilities: { [authorization]: authorizationProbability },
        confidence: authorizationProbability,
      },
      impact: { type: "score", score: impact, confidence: impactConfidence },
    },
  };
}

const WITH_CONTEXT = { hasTaskContext: true };

describe("decide", () => {
  it("allows a confident, in-scope, low-impact action", () => {
    expect(decide(facts(), WITH_CONTEXT)).toMatchObject({
      verdict: "allow",
      code: "approved",
      reason: "in scope, impact 1.5/4",
    });
  });

  it("asks when no user request exists, even for a confident allow", () => {
    expect(decide(facts(), { hasTaskContext: false })).toMatchObject({
      verdict: "ask",
      code: "escalate-insufficient-context",
    });
  });

  it("asks when the classifier reports insufficient context", () => {
    expect(decide(facts({ sufficiency: 0.4 }), WITH_CONTEXT).code).toBe(
      "escalate-insufficient-context",
    );
  });

  it("blocks an out-of-scope action at or above the block impact", () => {
    expect(
      decide(
        facts({
          authorization: "out_of_scope",
          authorizationProbability: 0.98,
          impact: 3,
          impactConfidence: 0.2,
        }),
        WITH_CONTEXT,
      ),
    ).toMatchObject({ verdict: "block", code: "blocked-out-of-scope" });
  });

  it("asks about an out-of-scope but low-impact action instead of blocking", () => {
    expect(
      decide(
        facts({
          authorization: "out_of_scope",
          authorizationProbability: 0.98,
          impact: 1,
        }),
        WITH_CONTEXT,
      ),
    ).toMatchObject({ verdict: "ask", code: "escalate-ambiguous" });
  });

  it("asks when out-of-scope confidence is below the trust threshold", () => {
    expect(
      decide(
        facts({
          authorization: "out_of_scope",
          authorizationProbability: 0.6,
          impact: 3.5,
        }),
        WITH_CONTEXT,
      ),
    ).toMatchObject({ verdict: "ask", code: "escalate-low-confidence" });
  });

  it("asks when authorization is unclear", () => {
    expect(decide(facts({ authorization: "unclear" }), WITH_CONTEXT).code).toBe(
      "escalate-ambiguous",
    );
  });

  it("asks about an in-scope action at or above the destructive threshold", () => {
    expect(decide(facts({ impact: 2.5 }), WITH_CONTEXT)).toMatchObject({
      verdict: "ask",
      code: "escalate-destructive",
    });
    expect(decide(facts({ impact: 2.49 }), WITH_CONTEXT).verdict).toBe("allow");
  });

  it("asks when confidence clears trust but not the allow threshold", () => {
    expect(decide(facts({ sufficiency: 0.8 }), WITH_CONTEXT).code).toBe(
      "escalate-low-confidence",
    );
    expect(
      decide(facts({ authorizationProbability: 0.8 }), WITH_CONTEXT).code,
    ).toBe("escalate-low-confidence");
  });

  it("asks on provider error and abort", () => {
    expect(
      decide(facts({ stopReason: "error", errorMessage: "503" }), WITH_CONTEXT),
    ).toMatchObject({ verdict: "ask", code: "escalate-unavailable" });
    expect(
      decide(facts({ stopReason: "aborted" }), WITH_CONTEXT).reason,
    ).toContain("aborted or timed out");
  });

  it.each([
    ["no answers", { stopReason: "stop" }],
    [
      "wrong sufficiency type",
      {
        stopReason: "stop",
        answers: {
          ...facts().answers,
          context_sufficiency: { type: "score", score: 1, confidence: 1 },
        },
      },
    ],
    [
      "unknown authorization label",
      {
        stopReason: "stop",
        answers: {
          ...facts().answers,
          authorization: {
            type: "choice",
            choice: "yes",
            probabilities: { yes: 1 },
            confidence: 1,
          },
        },
      },
    ],
    [
      "non-finite impact",
      {
        stopReason: "stop",
        answers: {
          ...facts().answers,
          impact: { type: "score", score: Number.NaN, confidence: 1 },
        },
      },
    ],
  ])("asks on malformed answers: %s", (_name, outcome) => {
    expect(decide(outcome as ClassifierOutcome, WITH_CONTEXT)).toMatchObject({
      verdict: "ask",
      code: "escalate-unavailable",
    });
  });

  it("clamps out-of-range impact scores", () => {
    expect(decide(facts({ impact: 9 }), WITH_CONTEXT).facts.impact?.level).toBe(
      4,
    );
  });
});
