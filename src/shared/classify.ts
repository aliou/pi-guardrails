/**
 * Client for the guardrails classification contract.
 *
 * Registered classifiers (external extensions answering the
 * {@link GUARDRAILS_CLASSIFY_REQUEST_EVENT} handshake) are offered actions
 * the deterministic pipeline already considers safe. Classifiers are
 * escalate-only: the only signal they can return is confirmation text, which
 * guardrails folds into the existing prompt flow. They cannot approve,
 * suppress, or override.
 *
 * Decisions carry no verdict field: a reply with `reason` flags the action,
 * a reply without it passes. Every registered classifier must reply to every
 * check; the check settles as soon as all have replied, or on the first
 * flagged reply. The timeout only protects against wedged classifiers, which
 * are dropped after {@link GUARDRAILS_CLASSIFY_MAX_MISSES} consecutive misses.
 */

import { randomUUID } from "node:crypto";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
  createClassifyCheckPayload,
  createClassifyRequestPayload,
  GUARDRAILS_CLASSIFY_CHECK_EVENT,
  GUARDRAILS_CLASSIFY_DECISION_EVENT,
  GUARDRAILS_CLASSIFY_REQUEST_EVENT,
  type GuardrailsClassifierRegistration,
  type GuardrailsClassifyAction,
  type GuardrailsClassifyDecisionPayload,
} from "./events";

export const GUARDRAILS_CLASSIFY_TIMEOUT_MS = 30_000;
export const GUARDRAILS_CLASSIFY_MAX_MISSES = 3;

export interface GuardrailsClassifyClient {
  /**
   * Ask classifiers to (re)register by emitting the request handshake.
   * Replaces the previous roster; call on session_start.
   */
  requestClassifiers(): void;
  /** Whether any classifier is registered. */
  hasClassifiers(): boolean;
  /**
   * Offer an action to every registered classifier. Resolves with the first
   * flag reason, or `undefined` when all classifiers pass (or the timeout
   * expires, which is indistinguishable from passing today).
   */
  requestCheck(input: {
    action: GuardrailsClassifyAction;
    cwd: string;
    /**
     * Called for each classifier dropped by this check's timeout. Kept
     * per-call (rather than a client option) so callers never retain a hook
     * context beyond the frame that owns it.
     */
    onDropped?: (classifier: GuardrailsClassifierRegistration) => void;
  }): Promise<GuardrailsClassifyFlag | undefined>;
  /** Stop listeners and cancel pending checks. */
  dispose(): void;
}

/** The first classifier flag from a check: who flagged and why. */
export interface GuardrailsClassifyFlag {
  classifierId: string;
  reason: string;
}

interface PendingCheck {
  /** Classifier ids that have not replied yet. */
  remaining: Set<string>;
  timer: ReturnType<typeof setTimeout>;
  resolve: (flag: GuardrailsClassifyFlag | undefined) => void;
}

export function createClassifyClient(
  pi: ExtensionAPI,
): GuardrailsClassifyClient {
  const classifiers = new Map<
    string,
    GuardrailsClassifierRegistration & { misses: number }
  >();
  const pending = new Map<string, PendingCheck>();

  function settle(
    requestId: string,
    check: PendingCheck,
    flag: GuardrailsClassifyFlag | undefined,
  ): void {
    clearTimeout(check.timer);
    pending.delete(requestId);
    check.resolve(flag);
  }

  function recordMiss(
    classifierId: string,
  ): GuardrailsClassifierRegistration | undefined {
    const entry = classifiers.get(classifierId);
    if (!entry) return undefined;
    entry.misses += 1;
    if (entry.misses < GUARDRAILS_CLASSIFY_MAX_MISSES) return undefined;
    classifiers.delete(classifierId);
    return entry;
  }

  function onDecision(data: unknown): void {
    const payload = data as GuardrailsClassifyDecisionPayload | undefined;
    if (!payload?.requestId || !payload.classifierId) return;
    const check = pending.get(payload.requestId);
    if (!check) return;
    check.remaining.delete(payload.classifierId);
    if (payload.reason) {
      settle(payload.requestId, check, {
        classifierId: payload.classifierId,
        reason: payload.reason,
      });
      return;
    }
    if (check.remaining.size === 0) {
      settle(payload.requestId, check, undefined);
    }
  }

  let stopDecisionListener: (() => void) | undefined;

  function requestClassifiers(): void {
    classifiers.clear();
    stopDecisionListener?.();
    stopDecisionListener = pi.events.on(
      GUARDRAILS_CLASSIFY_DECISION_EVENT,
      onDecision,
    );
    pi.events.emit(
      GUARDRAILS_CLASSIFY_REQUEST_EVENT,
      createClassifyRequestPayload((registration) => {
        if (!registration?.id) return;
        classifiers.set(registration.id, {
          id: registration.id,
          name: registration.name ?? registration.id,
          misses: 0,
        });
      }),
    );
  }

  function hasClassifiers(): boolean {
    return classifiers.size > 0;
  }

  function requestCheck(input: {
    action: GuardrailsClassifyAction;
    cwd: string;
    onDropped?: (classifier: GuardrailsClassifierRegistration) => void;
  }): Promise<GuardrailsClassifyFlag | undefined> {
    if (classifiers.size === 0) return Promise.resolve(undefined);

    const requestId = randomUUID();
    return new Promise((resolve) => {
      const check: PendingCheck = {
        remaining: new Set(classifiers.keys()),
        resolve,
        timer: setTimeout(() => {
          pending.delete(requestId);
          for (const classifierId of check.remaining) {
            const dropped = recordMiss(classifierId);
            if (dropped) input.onDropped?.(dropped);
          }
          resolve(undefined);
        }, GUARDRAILS_CLASSIFY_TIMEOUT_MS),
      };
      pending.set(requestId, check);
      pi.events.emit(
        GUARDRAILS_CLASSIFY_CHECK_EVENT,
        createClassifyCheckPayload(requestId, input.action, input.cwd),
      );
    });
  }

  function dispose(): void {
    stopDecisionListener?.();
    stopDecisionListener = undefined;
    for (const check of pending.values()) clearTimeout(check.timer);
    pending.clear();
    classifiers.clear();
  }

  return { requestClassifiers, hasClassifiers, requestCheck, dispose };
}
