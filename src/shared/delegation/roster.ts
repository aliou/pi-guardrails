import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
  GUARDRAILS_DELEGATE_REGISTER_EVENT,
  GUARDRAILS_DELEGATE_REQUEST_EVENT,
} from "../events";
import type {
  GuardrailsDelegate,
  GuardrailsDelegateRegisterPayload,
  GuardrailsDelegateRequestPayload,
} from "./types";

export interface DelegateRoster {
  list(): GuardrailsDelegate[];
}

function isDelegate(value: unknown): value is GuardrailsDelegate {
  if (!value || typeof value !== "object") return false;
  const delegate = value as Record<string, unknown>;
  return (
    typeof delegate.id === "string" &&
    delegate.id.trim() !== "" &&
    typeof delegate.name === "string" &&
    typeof delegate.decide === "function"
  );
}

export function createDelegateRoster(pi: ExtensionAPI): DelegateRoster {
  const delegates = new Map<string, GuardrailsDelegate>();

  const stopListening = pi.events.on(
    GUARDRAILS_DELEGATE_REGISTER_EVENT,
    (data) => {
      const delegate = (data as GuardrailsDelegateRegisterPayload | undefined)
        ?.delegate;
      if (!isDelegate(delegate)) return;
      delegates.set(delegate.id, delegate);
    },
  );
  pi.on("session_shutdown", () => {
    stopListening();
    delegates.clear();
  });

  const request: GuardrailsDelegateRequestPayload = {
    source: "guardrails",
    timestamp: new Date().toISOString(),
  };
  pi.events.emit(GUARDRAILS_DELEGATE_REQUEST_EVENT, request);

  return {
    list: () =>
      [...delegates.values()].filter((delegate) => {
        try {
          return delegate.isEnabled?.() ?? true;
        } catch {
          return false;
        }
      }),
  };
}

export function registerDelegate(
  pi: ExtensionAPI,
  delegate: GuardrailsDelegate,
): () => void {
  const payload: GuardrailsDelegateRegisterPayload = { delegate };
  const stopListening = pi.events.on(GUARDRAILS_DELEGATE_REQUEST_EVENT, () => {
    pi.events.emit(GUARDRAILS_DELEGATE_REGISTER_EVENT, payload);
  });
  pi.events.emit(GUARDRAILS_DELEGATE_REGISTER_EVENT, payload);
  return stopListening;
}
