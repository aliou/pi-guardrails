import { randomUUID } from "node:crypto";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { Action, Safety } from "../core/types";

export const GUARDRAILS_ACTION_BLOCKED_EVENT = "guardrails:action:blocked";
export const GUARDRAILS_RISK_DETECTED_EVENT = "guardrails:risk:detected";
export const GUARDRAILS_FEATURE_REQUEST_EVENT = "guardrails:feature:request";
export const GUARDRAILS_FEATURE_REGISTER_EVENT = "guardrails:feature:register";
export const GUARDRAILS_PROMPT_OPENED_EVENT = "guardrails:prompt:opened";
export const GUARDRAILS_PROMPT_CLOSED_EVENT = "guardrails:prompt:closed";
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
