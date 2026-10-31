import { describe, expect, it, vi } from "vitest";
import type { DelegationRequest } from "../../src/shared/delegation";
import {
  combineRuns,
  type ModelRun,
  parseModelRef,
  runClassifier,
} from "./classify";
import type { ClassifierOutcome } from "./decision";

const request: DelegationRequest = {
  feature: "permissionGate",
  action: { kind: "command", command: "rm -rf node_modules", origin: "bash" },
  reason: "recursive force delete",
  toolName: "bash",
  input: { command: "rm -rf node_modules" },
};

function outcome(
  authorization: "in_scope" | "unclear" | "out_of_scope",
  impact: number,
): ClassifierOutcome {
  return {
    stopReason: "stop",
    answers: {
      context_sufficiency: { type: "bool", probability: 0.95 },
      authorization: {
        type: "choice",
        choice: authorization,
        probabilities: { [authorization]: 0.95 },
      },
      impact: { type: "score", score: impact, confidence: 0.9 },
    },
  };
}

const ALLOW = outcome("in_scope", 1);
const ASK = outcome("unclear", 1);
const BLOCK = outcome("out_of_scope", 3);

function context(
  responses: Record<string, ClassifierOutcome | Error | undefined>,
  messages: unknown[] = [{ role: "user", content: "clean deps" }],
) {
  const classify = vi.fn(async (model: { id: string }) => {
    const response = responses[model.id];
    if (response instanceof Error) throw response;
    return response as ClassifierOutcome;
  });
  const getModelOfType = vi.fn(
    (_type: string, provider: string, model: string) => {
      const id = `${provider}/${model}`;
      return id in responses && responses[id] !== undefined
        ? { id }
        : undefined;
    },
  );
  return {
    cwd: "/workspace",
    signal: new AbortController().signal,
    modelRegistry: { classify, getModelOfType } as never,
    sessionManager: {
      buildSessionProjection: () => ({ messages }),
    } as never,
    classify,
  };
}

describe("parseModelRef", () => {
  it.each([
    ["typesafe/jev-latest", { provider: "typesafe", model: "jev-latest" }],
    [
      "aperture/typesafe/jev-latest",
      { provider: "aperture", model: "typesafe/jev-latest" },
    ],
    ["  cfm/clef  ", { provider: "cfm", model: "clef" }],
    ["no-slash", undefined],
    ["/model", undefined],
    ["provider/", undefined],
  ])("parses %j", (value, expected) => {
    expect(parseModelRef(value)).toEqual(expected);
  });
});

describe("runClassifier", () => {
  it("abstains when no configured model parses", async () => {
    const ctx = context({});
    await expect(
      runClassifier(request, ctx, { models: ["bad"], strategy: "fallback" }),
    ).resolves.toBeUndefined();
  });

  it("sends the flagged action, user requests, and guardrail flag", async () => {
    const ctx = context({ "p/a": ALLOW });
    await runClassifier(request, ctx, {
      models: ["p/a"],
      strategy: "fallback",
    });
    const [, sent] = ctx.classify.mock.calls[0] as unknown as [
      unknown,
      { state: Record<string, unknown> },
    ];
    expect(sent.state).toMatchObject({
      action: { kind: "bash command", command: "rm -rf node_modules" },
      task_context: { user_requests: ["clean deps"] },
      guardrail_flag: "recursive force delete",
    });
  });

  it("asks without a user request in the session", async () => {
    const ctx = context({ "p/a": ALLOW }, []);
    const answer = await runClassifier(request, ctx, {
      models: ["p/a"],
      strategy: "fallback",
    });
    expect(answer?.verdict).toBe("ask");
  });

  describe("fallback", () => {
    it("uses the first model that answers", async () => {
      const ctx = context({
        "p/missing": undefined,
        "p/broken": new Error("503"),
        "p/good": ALLOW,
        "p/never": BLOCK,
      });
      const answer = await runClassifier(request, ctx, {
        models: ["p/missing", "p/broken", "p/good", "p/never"],
        strategy: "fallback",
      });
      expect(answer?.verdict).toBe("allow");
      expect(answer?.reason).toMatch(/^p\/good: in scope/);
      expect(answer?.details.runs.map((run) => run.model)).toEqual([
        "p/missing",
        "p/broken",
        "p/good",
      ]);
    });

    it("asks when no model can answer", async () => {
      const ctx = context({ "p/a": new Error("down") });
      const answer = await runClassifier(request, ctx, {
        models: ["p/a"],
        strategy: "fallback",
      });
      expect(answer).toMatchObject({ verdict: "ask" });
      expect(answer?.reason).toContain("down");
    });

    it("does not fall through on a real ask", async () => {
      const ctx = context({ "p/a": ASK, "p/b": ALLOW });
      const answer = await runClassifier(request, ctx, {
        models: ["p/a", "p/b"],
        strategy: "fallback",
      });
      expect(answer?.verdict).toBe("ask");
      expect(ctx.classify).toHaveBeenCalledTimes(1);
    });
  });

  it("random starts from a shuffled model", async () => {
    const ctx = context({ "p/a": ALLOW, "p/b": BLOCK });
    const answer = await runClassifier(request, ctx, {
      models: ["p/a", "p/b"],
      strategy: "random",
      random: () => 0,
    });
    expect(answer?.verdict).toBe("block");
    expect(ctx.classify).toHaveBeenCalledTimes(1);
  });

  describe("consensus", () => {
    it("allows only when every model allows", async () => {
      const ctx = context({ "p/a": ALLOW, "p/b": ALLOW });
      const answer = await runClassifier(request, ctx, {
        models: ["p/a", "p/b"],
        strategy: "consensus",
      });
      expect(answer?.verdict).toBe("allow");
    });

    it("blocks when any model blocks", async () => {
      const ctx = context({ "p/a": ALLOW, "p/b": BLOCK, "p/c": ASK });
      const answer = await runClassifier(request, ctx, {
        models: ["p/a", "p/b", "p/c"],
        strategy: "consensus",
      });
      expect(answer?.verdict).toBe("block");
    });

    it("asks when any model asks or is unavailable", async () => {
      const unavailable = context({ "p/a": ALLOW, "p/b": undefined });
      expect(
        (
          await runClassifier(request, unavailable, {
            models: ["p/a", "p/b"],
            strategy: "consensus",
          })
        )?.verdict,
      ).toBe("ask");
    });
  });
});

describe("combineRuns", () => {
  const run = (verdict: "allow" | "ask" | "block"): ModelRun => ({
    model: verdict,
    elapsedMs: 1,
    decision: { verdict, code: "approved", reason: verdict, facts: {} },
  });

  it("returns nothing for no runs", () => {
    expect(combineRuns([])).toBeUndefined();
  });

  it("prefers block, then requires unanimous allow", () => {
    expect(combineRuns([run("allow"), run("block")])?.model).toBe("block");
    expect(combineRuns([run("allow"), run("allow")])?.model).toBe("allow");
    expect(combineRuns([run("allow"), run("ask")])?.model).toBe("ask");
  });
});
