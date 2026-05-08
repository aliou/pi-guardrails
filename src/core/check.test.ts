import { describe, expect, it, vi } from "vitest";
import { checkAction, resolveDecision } from "./check";
import type { Action, Rule, Safety } from "./types";

const commandAction: Action = { kind: "command", command: "rm -rf /tmp/test" };

type TestMeta = { pattern: string; source: "test" };

const testMetadata: TestMeta = { pattern: "rm -rf", source: "test" };

describe("checkAction", () => {
  it("returns safe when no rules match", async () => {
    const rules: Rule[] = [
      {
        key: "sudo",
        check: () => ({ kind: "pass" }),
      },
    ];

    await expect(checkAction(commandAction, rules)).resolves.toEqual({
      kind: "safe",
    });
  });

  it("returns dangerous for the first matching rule", async () => {
    const secondCheck = vi.fn(() => ({
      kind: "match" as const,
      reason: "second match",
      metadata: testMetadata,
    }));
    const rules: Rule<TestMeta>[] = [
      {
        key: "first",
        check: () => ({
          kind: "match",
          reason: "first match",
          metadata: testMetadata,
        }),
      },
      {
        key: "second",
        check: secondCheck,
      },
    ];

    await expect(checkAction(commandAction, rules)).resolves.toEqual({
      kind: "dangerous",
      action: commandAction,
      key: "first",
      reason: "first match",
      metadata: testMetadata,
    });
    expect(secondCheck).not.toHaveBeenCalled();
  });

  it("supports async rules", async () => {
    const rules: Rule[] = [
      {
        key: "async",
        check: async (action) =>
          action.kind === "command"
            ? {
                kind: "match",
                reason: "async match",
                metadata: null,
              }
            : { kind: "pass" },
      },
    ];

    await expect(checkAction(commandAction, rules)).resolves.toMatchObject({
      kind: "dangerous",
      key: "async",
      reason: "async match",
      metadata: null,
    });
  });

  it("propagates rule errors", async () => {
    const error = new Error("rule failed");
    const rules: Rule[] = [
      {
        key: "broken",
        check: () => {
          throw error;
        },
      },
    ];

    await expect(checkAction(commandAction, rules)).rejects.toThrow(error);
  });

  it("propagates async rule rejections", async () => {
    const error = new Error("async rule failed");
    const rules: Rule[] = [
      {
        key: "broken-async",
        check: async () => {
          throw error;
        },
      },
    ];

    await expect(checkAction(commandAction, rules)).rejects.toThrow(error);
  });

  it("preserves typed match metadata", async () => {
    const rules: Rule<TestMeta>[] = [
      {
        key: "typed",
        check: () => ({
          kind: "match",
          reason: "typed match",
          metadata: testMetadata,
        }),
      },
    ];

    const safety = await checkAction(commandAction, rules);

    if (safety.kind !== "dangerous") {
      throw new Error("expected dangerous safety");
    }

    expect(safety.metadata.pattern).toBe("rm -rf");

    const decision = resolveDecision(safety, "prompt");

    if (decision.kind !== "prompt") {
      throw new Error("expected prompt decision");
    }

    expect(decision.risk.metadata.pattern).toBe("rm -rf");
  });
});

describe("resolveDecision", () => {
  const dangerous: Safety = {
    kind: "dangerous",
    action: commandAction,
    key: "rm-rf",
    reason: "recursive force delete",
    metadata: null,
  };

  it("allows safe actions", () => {
    expect(resolveDecision({ kind: "safe" }, "denied")).toEqual({
      kind: "allow",
    });
  });

  it("allows dangerous actions when permission is granted", () => {
    expect(resolveDecision(dangerous, "granted")).toEqual({ kind: "allow" });
  });

  it("denies dangerous actions when permission is denied", () => {
    expect(resolveDecision(dangerous, "denied")).toEqual({
      kind: "deny",
      reason: "recursive force delete",
    });
  });

  it("prompts for dangerous actions when permission is prompt", () => {
    expect(resolveDecision(dangerous, "prompt")).toEqual({
      kind: "prompt",
      risk: dangerous,
    });
  });
});
