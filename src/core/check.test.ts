import { describe, expect, it, vi } from "vitest";
import { checkAction, resolveDecision } from "./check";
import type { Action, Rule, Safety } from "./types";

const commandAction: Action = { kind: "command", command: "rm -rf /tmp/test" };

describe("checkAction", () => {
  it("returns safe when no rules match", async () => {
    const rules: Rule[] = [
      {
        key: "sudo",
        reason: "superuser command",
        check: () => false,
      },
    ];

    await expect(checkAction(commandAction, rules)).resolves.toEqual({
      kind: "safe",
    });
  });

  it("returns dangerous for the first matching rule", async () => {
    const secondCheck = vi.fn(() => true);
    const rules: Rule[] = [
      {
        key: "first",
        reason: "first match",
        check: () => true,
      },
      {
        key: "second",
        reason: "second match",
        check: secondCheck,
      },
    ];

    await expect(checkAction(commandAction, rules)).resolves.toEqual({
      kind: "dangerous",
      action: commandAction,
      key: "first",
      reason: "first match",
    });
    expect(secondCheck).not.toHaveBeenCalled();
  });

  it("supports async rules", async () => {
    const rules: Rule[] = [
      {
        key: "async",
        reason: "async match",
        check: async (action) => action.kind === "command",
      },
    ];

    await expect(checkAction(commandAction, rules)).resolves.toMatchObject({
      kind: "dangerous",
      key: "async",
      reason: "async match",
    });
  });

  it("propagates rule errors", async () => {
    const error = new Error("rule failed");
    const rules: Rule[] = [
      {
        key: "broken",
        reason: "broken rule",
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
        reason: "broken async rule",
        check: async () => {
          throw error;
        },
      },
    ];

    await expect(checkAction(commandAction, rules)).rejects.toThrow(error);
  });
});

describe("resolveDecision", () => {
  const dangerous: Safety = {
    kind: "dangerous",
    action: commandAction,
    key: "rm-rf",
    reason: "recursive force delete",
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
