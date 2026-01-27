import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

export const GUARDRAILS_BLOCKED_EVENT = "guardrails:blocked";
export const GUARDRAILS_DANGEROUS_EVENT = "guardrails:dangerous";

export interface GuardrailsBlockedEvent {
  feature: "preventBrew" | "protectEnvFiles" | "permissionGate";
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
