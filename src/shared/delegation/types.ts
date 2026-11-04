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

/** What a responder may answer for an open prompt. `allow` allows the action once. */
export type PromptChoice = "allow" | "deny";

export interface PromptResponseRequest extends DelegationRequest {
  /** The same ID as the matching `guardrails:prompt:opened` event. */
  promptId: string;
  /** The answers this prompt accepts from a responder. */
  choices: readonly PromptChoice[];
}

export interface PromptResponse {
  choice: PromptChoice;
  reason: string;
}

export interface GuardrailsDelegate {
  id: string;
  name: string;
  isEnabled?(): boolean;
  /** Decides before any prompt opens, within `delegation.timeoutMs`. */
  decide?(
    request: DelegationRequest,
    context: DelegationContext,
  ): DelegateAnswer | undefined | Promise<DelegateAnswer | undefined>;
  /**
   * Answers a prompt while it is open, racing the local user. The first
   * answer wins; `context.signal` aborts once the prompt closes. Return
   * `undefined` to leave the prompt to someone else.
   */
  respond?(
    request: PromptResponseRequest,
    context: DelegationContext,
  ): PromptResponse | undefined | Promise<PromptResponse | undefined>;
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
