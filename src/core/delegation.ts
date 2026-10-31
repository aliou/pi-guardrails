export type DelegateVerdict = "allow" | "block" | "ask";

export const DELEGATE_VERDICTS: readonly DelegateVerdict[] = [
  "allow",
  "block",
  "ask",
];

export interface DelegateAnswer {
  verdict: DelegateVerdict;
  reason: string;
  details?: unknown;
}

export type DelegateStatus =
  | "answered"
  | "abstained"
  | "timeout"
  | "error"
  | "cancelled";

export interface DelegateOutcome {
  delegateId: string;
  delegateName: string;
  status: DelegateStatus;
  answer?: DelegateAnswer;
  error?: string;
  elapsedMs: number;
}

export interface DelegationResult {
  verdict: DelegateVerdict;
  reason: string;
  outcomes: DelegateOutcome[];
}

export function isDelegateAnswer(value: unknown): value is DelegateAnswer {
  if (!value || typeof value !== "object") return false;
  const answer = value as Record<string, unknown>;
  return (
    typeof answer.verdict === "string" &&
    (DELEGATE_VERDICTS as readonly string[]).includes(answer.verdict) &&
    typeof answer.reason === "string"
  );
}

function describeNonAnswer(outcome: DelegateOutcome): string {
  switch (outcome.status) {
    case "abstained":
      return `${outcome.delegateName} abstained`;
    case "timeout":
      return `${outcome.delegateName} timed out`;
    case "error":
      return `${outcome.delegateName} failed${outcome.error ? ` (${outcome.error})` : ""}`;
    case "cancelled":
      return `${outcome.delegateName} was cancelled`;
    default:
      return `${outcome.delegateName} did not answer`;
  }
}

function labeled(outcome: DelegateOutcome, reason: string): string {
  return `${outcome.delegateName}: ${reason}`;
}

export function combineDelegateOutcomes(
  outcomes: readonly DelegateOutcome[],
): DelegationResult {
  const list = [...outcomes];

  const blocking = list.find(
    (o) => o.status === "answered" && o.answer?.verdict === "block",
  );
  if (blocking?.answer) {
    return {
      verdict: "block",
      reason: labeled(blocking, blocking.answer.reason),
      outcomes: list,
    };
  }

  if (list.length === 0) {
    return {
      verdict: "ask",
      reason: "no decision delegates are registered",
      outcomes: list,
    };
  }

  const allAllow = list.every(
    (o) => o.status === "answered" && o.answer?.verdict === "allow",
  );
  if (allAllow) {
    return {
      verdict: "allow",
      reason: list
        .map((o) => labeled(o, o.answer?.reason ?? "allowed"))
        .join("; "),
      outcomes: list,
    };
  }

  const asking = list.find(
    (o) => o.status === "answered" && o.answer?.verdict === "ask",
  );
  if (asking?.answer) {
    return {
      verdict: "ask",
      reason: labeled(asking, asking.answer.reason),
      outcomes: list,
    };
  }

  const missing = list.find((o) => o.status !== "answered");
  return {
    verdict: "ask",
    reason: missing ? describeNonAnswer(missing) : "delegates did not agree",
    outcomes: list,
  };
}
