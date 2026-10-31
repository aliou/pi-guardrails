import type { ExtensionAPI, Theme } from "@earendil-works/pi-coding-agent";
import {
  type Component,
  Text,
  type TuiMouseEvent,
  type TuiMouseEventResult,
} from "@earendil-works/pi-tui";
import type {
  DelegateOutcome,
  DelegateStatus,
  DelegateVerdict,
} from "../../core/delegation";
import type { Action } from "../../core/types";
import type { DelegatedDecision } from "./types";

export const DELEGATION_ENTRY_TYPE = "guardrails:decision";

type DecisionTheme = Pick<Theme, "fg">;
type Color = "success" | "error" | "warning" | "muted" | "accent" | "dim";

export const TAG = "[guardrails]";

const VERDICT_STYLE: Record<DelegateVerdict, { color: Color; mark: string }> = {
  allow: { color: "success", mark: "✓" },
  block: { color: "error", mark: "✗" },
  ask: { color: "warning", mark: "?" },
};

const STATUS_STYLE: Record<
  Exclude<DelegateStatus, "answered">,
  { color: Color; label: string }
> = {
  abstained: { color: "warning", label: "abstained" },
  timeout: { color: "warning", label: "timed out" },
  error: { color: "warning", label: "failed" },
  cancelled: { color: "muted", label: "cancelled" },
};

export function actionLabel(action: Action, toolName: string): string {
  if (action.kind === "command") return action.command;
  return `${toolName} ${action.path}`;
}

export function formatMs(ms: number): string {
  return ms < 1000 ? `${Math.round(ms)}ms` : `${(ms / 1000).toFixed(1)}s`;
}

interface OutcomeParts {
  color: Color;
  mark: string;
  verdict: string;
  reason: string;
}

function outcomeParts(outcome: DelegateOutcome): OutcomeParts {
  if (outcome.status === "answered" && outcome.answer) {
    const style = VERDICT_STYLE[outcome.answer.verdict];
    return {
      ...style,
      verdict: outcome.answer.verdict,
      reason: outcome.answer.reason,
    };
  }
  const style =
    STATUS_STYLE[outcome.status as Exclude<DelegateStatus, "answered">] ??
    STATUS_STYLE.error;
  return {
    color: style.color,
    mark: "-",
    verdict: style.label,
    reason: outcome.status === "error" ? (outcome.error ?? "") : "",
  };
}

function allowed(outcome: DelegateOutcome): boolean {
  return outcome.status === "answered" && outcome.answer?.verdict === "allow";
}

function culprit(outcome: DelegateOutcome, theme: DecisionTheme): string {
  const parts = outcomeParts(outcome);
  const name = theme.fg("muted", outcome.delegateName);
  if (outcome.status === "answered") return `${name}: ${parts.reason}`;
  return `${name} ${parts.verdict}${parts.reason ? `: ${parts.reason}` : ""}`;
}

export function decisionLine(
  decision: DelegatedDecision,
  theme: DecisionTheme,
): string {
  const { color, mark } = VERDICT_STYLE[decision.verdict];
  const outcomes = decision.outcomes;
  let body: string;

  if (decision.verdict === "allow") {
    const names = outcomes.map((o) => theme.fg("muted", o.delegateName));
    body = `${theme.fg(color, `${mark} allowed:`)} ${names.join(", ")}`;
  } else if (decision.verdict === "block") {
    const blocker = outcomes.find(
      (o) => o.status === "answered" && o.answer?.verdict === "block",
    );
    body = `${theme.fg(color, `${mark} blocked:`)} ${blocker ? culprit(blocker, theme) : decision.reason}`;
  } else {
    const culprits = outcomes.filter((o) => !allowed(o));
    const why =
      culprits.length > 0
        ? culprits.map((o) => culprit(o, theme)).join("; ")
        : decision.reason;
    body = `${theme.fg(color, `${mark} escalated:`)} ${why}`;
  }

  return `${theme.fg("accent", TAG)} ${body} ${theme.fg("dim", `· ${formatMs(decision.elapsedMs)}`)}`;
}

function outcomeLine(outcome: DelegateOutcome, theme: DecisionTheme): string {
  const p = outcomeParts(outcome);
  return [
    `${theme.fg(p.color, p.mark)} ${outcome.delegateName}${theme.fg("muted", ":")} ${theme.fg(p.color, p.verdict)}`,
    p.reason,
    theme.fg("dim", formatMs(outcome.elapsedMs)),
  ]
    .filter(Boolean)
    .join("  ");
}

export function expandedDecisionLines(
  decision: DelegatedDecision,
  theme: DecisionTheme,
): string[] {
  return [
    decisionLine(decision, theme),
    `${theme.fg("muted", "flagged:")} ${decision.flaggedReason}`,
    ...decision.outcomes.map((o) => outcomeLine(o, theme)),
  ];
}

function isDecision(value: unknown): value is DelegatedDecision {
  if (!value || typeof value !== "object") return false;
  const data = value as Partial<DelegatedDecision>;
  return (
    typeof data.verdict === "string" &&
    data.verdict in VERDICT_STYLE &&
    !!data.action &&
    Array.isArray(data.outcomes)
  );
}

class DecisionEntryComponent implements Component {
  constructor(
    private readonly decision: DelegatedDecision,
    private readonly theme: DecisionTheme,
    private expanded: boolean,
  ) {}

  invalidate(): void {}

  handleMouse(event: TuiMouseEvent): TuiMouseEventResult | undefined {
    if (event.type !== "click") return undefined;
    this.expanded = !this.expanded;
    return { handled: true };
  }

  render(width: number): string[] {
    const lines = this.expanded
      ? expandedDecisionLines(this.decision, this.theme)
      : [decisionLine(this.decision, this.theme)];
    return new Text(lines.join("\n"), 1, 0).render(width);
  }
}

export function renderDecisionEntry(
  data: unknown,
  theme: DecisionTheme,
  options: { expanded: boolean } = { expanded: false },
): Component | undefined {
  if (!isDecision(data)) return undefined;
  return new DecisionEntryComponent(data, theme, options.expanded);
}

export function registerDecisionEntryRenderer(pi: ExtensionAPI): void {
  pi.registerEntryRenderer<DelegatedDecision>(
    DELEGATION_ENTRY_TYPE,
    (entry, options, theme) => renderDecisionEntry(entry.data, theme, options),
  );
}
