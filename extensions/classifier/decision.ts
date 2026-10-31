import type { DelegateVerdict } from "../../src/core/delegation";
import { AUTHORIZATION_LABELS, type AuthorizationLabel } from "./requests";

export const TRUST_CONFIDENCE = 0.7;
export const ALLOW_CONFIDENCE = 0.85;
export const DESTRUCTIVE_IMPACT = 2.5;
export const BLOCK_IMPACT = 2;

export type ClassifierDecisionCode =
  | "approved"
  | "escalate-insufficient-context"
  | "escalate-ambiguous"
  | "escalate-destructive"
  | "escalate-low-confidence"
  | "escalate-unavailable"
  | "blocked-out-of-scope";

export interface ClassifierFacts {
  contextSufficiency?: number;
  authorization?: { label: AuthorizationLabel; probability: number };
  impact?: { level: number; confidence: number };
}

export interface ClassifierDecision {
  verdict: DelegateVerdict;
  code: ClassifierDecisionCode;
  reason: string;
  facts: ClassifierFacts;
}

export interface ClassifierOutcome {
  stopReason: string;
  errorMessage?: string;
  answers?: Record<string, AnswerLike>;
}

type ChoiceAnswer = {
  type: "choice";
  choice: string;
  probabilities?: Record<string, number>;
  confidence?: number;
};
type BoolAnswer = { type: "bool"; probability: number };
type ScoreAnswer = { type: "score"; score: number; confidence: number };
type AnswerLike = ChoiceAnswer | BoolAnswer | ScoreAnswer;

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function percent(value: number): string {
  return `${Math.round(clamp01(value) * 100)}%`;
}

export function unavailable(
  detail: string,
  facts: ClassifierFacts = {},
): ClassifierDecision {
  return {
    verdict: "ask",
    code: "escalate-unavailable",
    reason: `could not review this (${detail})`,
    facts,
  };
}

function readAuthorization(
  answer: AnswerLike | undefined,
): { label: AuthorizationLabel; probability: number } | null {
  if (!answer || answer.type !== "choice") return null;
  if (!(AUTHORIZATION_LABELS as readonly string[]).includes(answer.choice)) {
    return null;
  }
  const label = answer.choice as AuthorizationLabel;
  const fromProbabilities = answer.probabilities?.[label];
  const probability = finite(fromProbabilities)
    ? fromProbabilities
    : finite(answer.confidence)
      ? answer.confidence
      : Number.NaN;
  if (!finite(probability)) return null;
  return { label, probability: clamp01(probability) };
}

function readBool(answer: AnswerLike | undefined): number | null {
  if (!answer || answer.type !== "bool") return null;
  if (!finite(answer.probability)) return null;
  return clamp01(answer.probability);
}

function readScore(
  answer: AnswerLike | undefined,
): { level: number; confidence: number } | null {
  if (!answer || answer.type !== "score") return null;
  if (!finite(answer.score) || !finite(answer.confidence)) return null;
  return {
    level: Math.min(4, Math.max(0, answer.score)),
    confidence: clamp01(answer.confidence),
  };
}

export interface DecideOptions {
  hasTaskContext: boolean;
}

export function decide(
  outcome: ClassifierOutcome,
  options: DecideOptions,
): ClassifierDecision {
  const facts: ClassifierFacts = {};

  if (outcome.stopReason !== "stop") {
    return unavailable(
      outcome.stopReason === "aborted"
        ? "request aborted or timed out"
        : (outcome.errorMessage ?? outcome.stopReason),
    );
  }

  if (!options.hasTaskContext) {
    return {
      verdict: "ask",
      code: "escalate-insufficient-context",
      reason: "no earlier user request to judge this against",
      facts,
    };
  }

  const sufficiency = readBool(outcome.answers?.context_sufficiency);
  if (sufficiency === null) return unavailable("missing sufficiency answer");
  facts.contextSufficiency = sufficiency;

  const authorization = readAuthorization(outcome.answers?.authorization);
  if (!authorization) {
    return unavailable("missing or invalid authorization answer", facts);
  }
  facts.authorization = authorization;

  const impact = readScore(outcome.answers?.impact);
  if (!impact) return unavailable("missing or invalid impact answer", facts);
  facts.impact = impact;

  const impactText = `impact ${impact.level.toFixed(1)}/4`;

  if (
    authorization.label === "out_of_scope" &&
    authorization.probability >= TRUST_CONFIDENCE
  ) {
    if (impact.level >= BLOCK_IMPACT) {
      return {
        verdict: "block",
        code: "blocked-out-of-scope",
        reason: `outside what you asked for, ${impactText}`,
        facts,
      };
    }
    return {
      verdict: "ask",
      code: "escalate-ambiguous",
      reason: `does not clearly follow from your request, but ${impactText} is low`,
      facts,
    };
  }

  if (authorization.label === "unclear") {
    return {
      verdict: "ask",
      code: "escalate-ambiguous",
      reason: "unclear whether your request covers this",
      facts,
    };
  }

  if (authorization.label === "out_of_scope") {
    return {
      verdict: "ask",
      code: "escalate-low-confidence",
      reason: `leaned out of scope, but only ${percent(authorization.probability)} confident`,
      facts,
    };
  }

  if (sufficiency < TRUST_CONFIDENCE) {
    return {
      verdict: "ask",
      code: "escalate-insufficient-context",
      reason: `not enough context to judge (sufficiency ${percent(sufficiency)})`,
      facts,
    };
  }

  if (impact.level >= DESTRUCTIVE_IMPACT) {
    return {
      verdict: "ask",
      code: "escalate-destructive",
      reason: `in scope, but ${impactText} is at or above the destructive threshold`,
      facts,
    };
  }

  if (
    sufficiency >= ALLOW_CONFIDENCE &&
    authorization.probability >= ALLOW_CONFIDENCE
  ) {
    return {
      verdict: "allow",
      code: "approved",
      reason: `in scope, ${impactText}`,
      facts,
    };
  }

  return {
    verdict: "ask",
    code: "escalate-low-confidence",
    reason: `leaned in scope, but not confidently enough (${percent(Math.min(sufficiency, authorization.probability))})`,
    facts,
  };
}
