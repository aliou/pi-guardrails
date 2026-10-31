import type { Theme } from "@earendil-works/pi-coding-agent";
import { describe, expect, it } from "vitest";
import type { DelegateOutcome } from "../../core/delegation";
import {
  decisionLine,
  expandedDecisionLines,
  renderDecisionEntry,
} from "./entry";
import type { DelegatedDecision } from "./types";

const taggingTheme = {
  fg: (color: string, text: string) => `[${color}:${text}]`,
} as unknown as Theme;

const plainTheme = {
  fg: (_color: string, text: string) => text,
} as unknown as Theme;

function answered(
  name: string,
  verdict: "allow" | "block" | "ask",
  reason: string,
  elapsedMs: number,
): DelegateOutcome {
  return {
    delegateId: name,
    delegateName: name,
    status: "answered",
    answer: { verdict, reason },
    elapsedMs,
  };
}

function decision(
  verdict: DelegatedDecision["verdict"],
  outcomes: DelegateOutcome[],
  elapsedMs = 4000,
): DelegatedDecision {
  return {
    feature: "permissionGate",
    toolName: "bash",
    action: { kind: "command", command: "rm -rf build/cache" },
    flaggedReason: "recursive force delete",
    verdict,
    reason: "",
    outcomes,
    elapsedMs,
  };
}

const escalated = decision("ask", [
  answered("no-network", "allow", "no network access", 1),
  {
    delegateId: "r",
    delegateName: "change-review",
    status: "timeout",
    elapsedMs: 4000,
  },
  answered("classifier", "allow", "in scope, impact 1.8/4", 181),
]);

const blocked = decision(
  "block",
  [
    answered(
      "no-network",
      "block",
      "network downloads are not allowed here",
      1,
    ),
    {
      delegateId: "c",
      delegateName: "classifier",
      status: "cancelled",
      elapsedMs: 1,
    },
  ],
  1,
);

describe("decisionLine", () => {
  it("lists every delegate when allowed", () => {
    const allowed = decision(
      "allow",
      [
        answered("no-network", "allow", "ok", 1),
        answered("classifier", "allow", "ok", 181),
      ],
      1500,
    );
    expect(decisionLine(allowed, plainTheme)).toBe(
      "[guardrails] ✓ allowed: no-network, classifier · 1.5s",
    );
  });

  it("names every delegate that did not allow when escalated", () => {
    expect(decisionLine(escalated, plainTheme)).toBe(
      "[guardrails] ? escalated: change-review timed out · 4.0s",
    );
    const mixed = decision("ask", [
      answered("classifier", "ask", "unclear whether you asked for this", 200),
      {
        delegateId: "b",
        delegateName: "broken",
        status: "error",
        error: "boom",
        elapsedMs: 3,
      },
      answered("no-network", "allow", "ok", 1),
    ]);
    expect(decisionLine(mixed, plainTheme)).toBe(
      "[guardrails] ? escalated: classifier: unclear whether you asked for this; broken failed: boom · 4.0s",
    );
  });

  it("names only the blocking delegate when blocked", () => {
    expect(decisionLine(blocked, plainTheme)).toBe(
      "[guardrails] ✗ blocked: no-network: network downloads are not allowed here · 1ms",
    );
  });

  it.each([
    ["allow", "success", "✓ allowed:"],
    ["block", "error", "✗ blocked:"],
    ["ask", "warning", "? escalated:"],
  ] as const)("colors the %s mark and verb %s after an accent tag", (verdict, color, verb) => {
    expect(decisionLine(decision(verdict, []), taggingTheme)).toMatch(
      new RegExp(
        `^\\[accent:\\[guardrails\\]\\] \\[${color}:${verb.replace("?", "\\?")}\\]`,
      ),
    );
  });

  it("mutes delegate names and dims the time", () => {
    const line = decisionLine(escalated, taggingTheme);
    expect(line).toContain("[muted:change-review] timed out");
    expect(line.endsWith("[dim:· 4.0s]")).toBe(true);
  });

  it("does not repeat the command", () => {
    expect(decisionLine(escalated, plainTheme)).not.toContain("rm -rf");
  });
});

describe("expandedDecisionLines", () => {
  it("adds the flagged reason and one line per delegate", () => {
    expect(expandedDecisionLines(escalated, plainTheme)).toEqual([
      "[guardrails] ? escalated: change-review timed out · 4.0s",
      "flagged: recursive force delete",
      "✓ no-network: allow  no network access  1ms",
      "- change-review: timed out  4.0s",
      "✓ classifier: allow  in scope, impact 1.8/4  181ms",
    ]);
  });

  it("colors each delegate mark and verdict by its status", () => {
    const [, , blocker, cancelled] = expandedDecisionLines(
      blocked,
      taggingTheme,
    );
    expect(blocker).toBe(
      "[error:✗] no-network[muted::] [error:block]  network downloads are not allowed here  [dim:1ms]",
    );
    expect(cancelled).toBe(
      "[muted:-] classifier[muted::] [muted:cancelled]  [dim:1ms]",
    );
  });
});

describe("renderDecisionEntry", () => {
  it("ignores malformed entry data", () => {
    expect(renderDecisionEntry({ nope: true }, plainTheme)).toBe(undefined);
  });

  it("renders one line collapsed and more lines expanded", () => {
    expect(
      renderDecisionEntry(escalated, plainTheme)?.render(120),
    ).toHaveLength(1);
    expect(
      renderDecisionEntry(escalated, plainTheme, { expanded: true })?.render(
        120,
      ),
    ).toHaveLength(5);
  });

  it("toggles on click", () => {
    const component = renderDecisionEntry(escalated, plainTheme);
    expect(component?.handleMouse?.({ type: "click" } as never)).toEqual({
      handled: true,
    });
    expect(component?.render(120)).toHaveLength(5);
    component?.handleMouse?.({ type: "click" } as never);
    expect(component?.render(120)).toHaveLength(1);
  });

  it("ignores other mouse events", () => {
    const component = renderDecisionEntry(escalated, plainTheme);
    expect(component?.handleMouse?.({ type: "move" } as never)).toBeUndefined();
    expect(component?.render(120)).toHaveLength(1);
  });
});
