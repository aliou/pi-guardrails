import { randomUUID } from "node:crypto";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { Action, Safety } from "../core/types";

export const GUARDRAILS_ACTION_BLOCKED_EVENT = "guardrails:action:blocked";
export const GUARDRAILS_RISK_DETECTED_EVENT = "guardrails:risk:detected";
export const GUARDRAILS_FEATURE_REQUEST_EVENT = "guardrails:feature:request";
export const GUARDRAILS_FEATURE_REGISTER_EVENT = "guardrails:feature:register";
export const GUARDRAILS_PROMPT_OPENED_EVENT = "guardrails:prompt:opened";
export const GUARDRAILS_PROMPT_CLOSED_EVENT = "guardrails:prompt:closed";
export const GUARDRAILS_CLASSIFY_REQUEST_EVENT = "guardrails:classify:request";
export const GUARDRAILS_CLASSIFY_CHECK_EVENT = "guardrails:classify:check";
export const GUARDRAILS_CLASSIFY_DECISION_EVENT =
  "guardrails:classify:decision";
/** @deprecated Use GUARDRAILS_PROMPT_OPENED_EVENT. */
export const GUARDRAILS_ACTION_PROMPTED_EVENT = "guardrails:action:prompted";

export type GuardrailsFeatureId = "policies" | "permissionGate" | "pathAccess";

export interface GuardrailsEventBase {
  source: "guardrails";
  feature: GuardrailsFeatureId;
  timestamp: string;
}

export interface GuardrailsFeatureRequestPayload {
  source: "guardrails";
  timestamp: string;
}

export interface GuardrailsFeatureRegisterPayload {
  source: "guardrails";
  timestamp: string;
  feature: {
    id: GuardrailsFeatureId;
  };
}

/**
 * Description of an action offered to classifiers for a second opinion.
 * Defined here (rather than reusing the core Action type) so that external
 * classifier extensions can answer the contract without importing guardrails
 * internals.
 */
export type GuardrailsClassifyAction = {
  kind: "command";
  command: string;
  origin?: string;
};

/** Identity a classifier registers with. */
export interface GuardrailsClassifierRegistration {
  /** Stable identifier for the classifier extension, e.g. "pi-jev". */
  id: string;
  /** Human-readable name for notifications and settings UI. */
  name: string;
}

/**
 * Registration handshake. Guardrails emits this on session_start; each
 * classifier extension present answers by calling `answer` with its
 * registration. A fresh request is emitted every session and replaces the
 * previous roster.
 */
export interface GuardrailsClassifyRequestPayload {
  source: "guardrails";
  timestamp: string;
  /** Call once with the classifier's registration. */
  answer: (registration: GuardrailsClassifierRegistration) => void;
}

/**
 * One classification request, emitted for an action the deterministic
 * pipeline considers safe. Every registered classifier receives it and must
 * reply with exactly one GUARDRAILS_CLASSIFY_DECISION_EVENT for this
 * requestId, even to pass.
 */
export interface GuardrailsClassifyCheckPayload {
  source: "guardrails";
  timestamp: string;
  /** Correlates this check with its decisions. */
  requestId: string;
  action: GuardrailsClassifyAction;
  cwd: string;
}

/**
 * A classifier's answer to a check. Escalate-only: `reason` present means
 * "show the user this confirmation text"; absent means no objection. The
 * first decision carrying a reason wins and the rest are discarded.
 */
export interface GuardrailsClassifyDecisionPayload {
  requestId: string;
  /** `id` from the answering classifier's registration. */
  classifierId: string;
  /** Why the user should confirm this action. Omit to pass. */
  reason?: string;
}

export type GuardrailsBlockSource =
  | "policy"
  | "permission"
  | "user"
  | "user-stop"
  | "nonInteractive";

export type GuardrailsActionBlockedPayload<TMeta = unknown> =
  GuardrailsEventBase & {
    action: Action;
    reason: string;
    block: {
      source: GuardrailsBlockSource;
      metadata?: TMeta;
    };
    context?: {
      toolName?: string;
      input?: Record<string, unknown>;
    };
  };

export interface GuardrailsPrompt<TMeta = unknown> {
  /** What kind of prompt was shown */
  kind: "confirmation" | "permission";
  /** The feature-specific metadata about the risk */
  metadata?: TMeta;
}

export interface GuardrailsPromptWithId<TMeta = unknown>
  extends GuardrailsPrompt<TMeta> {
  /** Correlates this event with its matching prompt-closed event. */
  id: string;
}

export interface GuardrailsPromptEventDetails<
  TMeta = unknown,
  TPrompt extends GuardrailsPrompt<TMeta> = GuardrailsPrompt<TMeta>,
> {
  feature: GuardrailsFeatureId;
  action: Action;
  reason: string;
  prompt: TPrompt;
  context?: {
    toolName?: string;
    input?: Record<string, unknown>;
  };
}

export type GuardrailsActionPromptedPayload<TMeta = unknown> =
  GuardrailsEventBase & GuardrailsPromptEventDetails<TMeta>;

export type GuardrailsPromptOpenedPayload<TMeta = unknown> =
  GuardrailsEventBase &
    GuardrailsPromptEventDetails<TMeta, GuardrailsPromptWithId<TMeta>>;

export type GuardrailsPromptClosedPayload = GuardrailsEventBase & {
  prompt: {
    /** The ID from the matching prompt-opened event. */
    id: string;
  };
};

export type GuardrailsRiskDetectedPayload<TMeta = unknown> =
  GuardrailsEventBase & {
    risk: Safety<TMeta> & { kind: "dangerous" };
    context?: {
      toolName?: string;
      input?: Record<string, unknown>;
    };
  };

function timestamp(): string {
  return new Date().toISOString();
}

export function createFeatureRequestPayload(): GuardrailsFeatureRequestPayload {
  return {
    source: "guardrails",
    timestamp: timestamp(),
  };
}

export function createFeatureRegisterPayload(
  feature: GuardrailsFeatureId,
): GuardrailsFeatureRegisterPayload {
  return {
    source: "guardrails",
    timestamp: timestamp(),
    feature: { id: feature },
  };
}

export function createClassifyRequestPayload(
  answer: GuardrailsClassifyRequestPayload["answer"],
): GuardrailsClassifyRequestPayload {
  return {
    source: "guardrails",
    timestamp: timestamp(),
    answer,
  };
}

export function createClassifyCheckPayload(
  requestId: string,
  action: GuardrailsClassifyAction,
  cwd: string,
): GuardrailsClassifyCheckPayload {
  return {
    source: "guardrails",
    timestamp: timestamp(),
    requestId,
    action,
    cwd,
  };
}

export function createPromptOpenedPayload<TMeta = unknown>(
  event: GuardrailsPromptEventDetails<TMeta>,
): GuardrailsPromptOpenedPayload<TMeta> {
  return {
    source: "guardrails",
    timestamp: timestamp(),
    ...event,
    prompt: {
      ...event.prompt,
      id: randomUUID(),
    },
  };
}

export function createPromptClosedPayload(
  opened: Pick<GuardrailsPromptOpenedPayload, "feature" | "prompt">,
): GuardrailsPromptClosedPayload {
  return {
    source: "guardrails",
    feature: opened.feature,
    timestamp: timestamp(),
    prompt: { id: opened.prompt.id },
  };
}

export function emitActionBlocked<TMeta = unknown>(
  pi: ExtensionAPI,
  event: Omit<GuardrailsActionBlockedPayload<TMeta>, "source" | "timestamp">,
): void {
  pi.events.emit(GUARDRAILS_ACTION_BLOCKED_EVENT, {
    source: "guardrails",
    timestamp: timestamp(),
    ...event,
  });
}

export function emitRiskDetected<TMeta = unknown>(
  pi: ExtensionAPI,
  event: Omit<GuardrailsRiskDetectedPayload<TMeta>, "source" | "timestamp">,
): void {
  pi.events.emit(GUARDRAILS_RISK_DETECTED_EVENT, {
    source: "guardrails",
    timestamp: timestamp(),
    ...event,
  });
}

export function setupLegacyPromptEventAlias(
  pi: ExtensionAPI,
  feature: GuardrailsFeatureId,
): void {
  const stopListening = pi.events.on(GUARDRAILS_PROMPT_OPENED_EVENT, (data) => {
    const payload = data as GuardrailsPromptOpenedPayload | undefined;
    if (payload?.feature !== feature || !payload.prompt?.id) return;

    const { id: _id, ...prompt } = payload.prompt;
    const legacyPayload: GuardrailsActionPromptedPayload = {
      ...payload,
      prompt,
    };
    pi.events.emit(GUARDRAILS_ACTION_PROMPTED_EVENT, legacyPayload);
  });

  pi.on("session_shutdown", stopListening);
}
