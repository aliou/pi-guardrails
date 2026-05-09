import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

// TODO: we need to harmonize the format of the events with similar scoping as the ext registration events from the registry.
export const GUARDRAILS_BLOCKED_EVENT = "guardrails:blocked";
export const GUARDRAILS_DANGEROUS_EVENT = "guardrails:dangerous";

export type GuardrailsFeatureId = "policies" | "permissionGate" | "pathAccess";

export const GUARDRAILS_EXTENSIONS_REQUEST_EVENT =
  "guardrails:extensions:request";
export const GUARDRAILS_EXTENSIONS_REGISTER_EVENT =
  "guardrails:extensions:register";

export interface GuardrailsExtensionsRegisterPayload {
  feature: GuardrailsFeatureId;
}

// TODO: this should use core types and not an additional abstraction here, imho
export interface GuardrailsBlockedEvent {
  feature: "policies" | "permissionGate" | "pathAccess";
  toolName: string;
  input: Record<string, unknown>;
  reason: string;
  userDenied?: boolean;
}

export interface GuardrailsDangerousEvent {
  command: string;
  description: string;
  pattern: string;
}

export function emitBlocked(
  pi: ExtensionAPI,
  event: GuardrailsBlockedEvent,
): void {
  pi.events.emit(GUARDRAILS_BLOCKED_EVENT, event);
}

export function emitDangerous(
  pi: ExtensionAPI,
  event: GuardrailsDangerousEvent,
): void {
  pi.events.emit(GUARDRAILS_DANGEROUS_EVENT, event);
}
