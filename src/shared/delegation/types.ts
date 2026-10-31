import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import type {
  DelegateAnswer,
  DelegateOutcome,
  DelegateVerdict,
} from "../../core/delegation";
import type { Action } from "../../core/types";
import type { GuardrailsFeatureId } from "../events";

export interface DelegationRequest {
  feature: GuardrailsFeatureId;
  action: Action;
  reason: string;
  metadata?: unknown;
  toolName: string;
  input: Record<string, unknown>;
}

export interface DelegationContext {
  cwd: string;
  signal: AbortSignal;
  sessionManager: ExtensionContext["sessionManager"];
  modelRegistry: ExtensionContext["modelRegistry"];
}

export interface GuardrailsDelegate {
  id: string;
  name: string;
  isEnabled?(): boolean;
  decide(
    request: DelegationRequest,
    context: DelegationContext,
  ): DelegateAnswer | undefined | Promise<DelegateAnswer | undefined>;
}

export interface GuardrailsDelegateRequestPayload {
  source: "guardrails";
  timestamp: string;
}

export interface GuardrailsDelegateRegisterPayload {
  delegate: GuardrailsDelegate;
}

export interface DelegatedDecision {
  feature: GuardrailsFeatureId;
  toolName: string;
  action: Action;
  flaggedReason: string;
  verdict: DelegateVerdict;
  reason: string;
  outcomes: DelegateOutcome[];
  elapsedMs: number;
}

export type GuardrailsDecisionDelegatedPayload = DelegatedDecision & {
  source: "guardrails";
  timestamp: string;
};
