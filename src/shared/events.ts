import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { Action, Safety } from "../core/types";

export const GUARDRAILS_ACTION_BLOCKED_EVENT = "guardrails:action:blocked";
export const GUARDRAILS_RISK_DETECTED_EVENT = "guardrails:risk:detected";
export const GUARDRAILS_FEATURE_REQUEST_EVENT = "guardrails:feature:request";
export const GUARDRAILS_FEATURE_REGISTER_EVENT = "guardrails:feature:register";
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

export type GuardrailsActionPromptedPayload<TMeta = unknown> =
  GuardrailsEventBase & {
    action: Action;
    reason: string;
    prompt: {
      /** What kind of prompt was shown */
      kind: "confirmation" | "permission";
      /** The feature-specific metadata about the risk */
      metadata?: TMeta;
    };
    context?: {
      toolName?: string;
      input?: Record<string, unknown>;
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

export function emitActionPrompted<TMeta = unknown>(
  pi: ExtensionAPI,
  event: Omit<GuardrailsActionPromptedPayload<TMeta>, "source" | "timestamp">,
): void {
  pi.events.emit(GUARDRAILS_ACTION_PROMPTED_EVENT, {
    source: "guardrails",
    timestamp: timestamp(),
    ...event,
  });
}
