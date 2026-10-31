import { randomUUID } from "node:crypto";
import type {
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import {
  combineDelegateOutcomes,
  type DelegateOutcome,
  isDelegateAnswer,
} from "../../core/delegation";
import { GUARDRAILS_DECISION_DELEGATED_EVENT } from "../events";
import { delegationBoard } from "./board";
import { DELEGATION_ENTRY_TYPE } from "./entry";
import { DelegationProgress } from "./progress";
import type { DelegateRoster } from "./roster";
import type {
  DelegatedDecision,
  DelegationContext,
  DelegationRequest,
  GuardrailsDecisionDelegatedPayload,
  GuardrailsDelegate,
} from "./types";

export interface RunDelegatesOptions {
  timeoutMs: number;
  signal?: AbortSignal;
  onOutcome?: (index: number, outcome: DelegateOutcome) => void;
}

type DelegationCtx = Pick<
  ExtensionContext,
  "cwd" | "sessionManager" | "modelRegistry" | "signal"
> &
  Partial<Pick<ExtensionContext, "mode" | "ui">>;

function errorText(error: unknown): string {
  const text =
    error instanceof Error ? error.message : String(error ?? "unknown error");
  return text.length > 200 ? `${text.slice(0, 199)}…` : text;
}

export async function runDelegates(
  delegates: readonly GuardrailsDelegate[],
  request: DelegationRequest,
  ctx: Omit<DelegationContext, "signal">,
  options: RunDelegatesOptions,
): Promise<DelegateOutcome[]> {
  const controller = new AbortController();
  let stopReason: "timeout" | "block" | "abort" | undefined;
  const stop = (reason: "timeout" | "block" | "abort") => {
    stopReason ??= reason;
    controller.abort();
  };
  const forwardAbort = () => stop("abort");
  options.signal?.addEventListener("abort", forwardAbort, { once: true });
  if (options.signal?.aborted) stop("abort");

  const timer = setTimeout(() => stop("timeout"), options.timeoutMs);
  controller.signal.addEventListener("abort", () => clearTimeout(timer), {
    once: true,
  });
  const aborted = new Promise<"aborted">((resolve) => {
    if (controller.signal.aborted) resolve("aborted");
    controller.signal.addEventListener("abort", () => resolve("aborted"), {
      once: true,
    });
  });

  const context: DelegationContext = { ...ctx, signal: controller.signal };

  const run = async (
    delegate: GuardrailsDelegate,
  ): Promise<DelegateOutcome> => {
    const startedAt = performance.now();
    const base = { delegateId: delegate.id, delegateName: delegate.name };
    const elapsed = () => Math.round(performance.now() - startedAt);

    try {
      const result = await Promise.race([
        Promise.resolve().then(() => delegate.decide(request, context)),
        aborted,
      ]);

      if (result === "aborted") {
        return {
          ...base,
          status: stopReason === "timeout" ? "timeout" : "cancelled",
          elapsedMs: elapsed(),
        };
      }
      if (result === undefined) {
        return { ...base, status: "abstained", elapsedMs: elapsed() };
      }
      if (!isDelegateAnswer(result)) {
        return {
          ...base,
          status: "error",
          error: "malformed answer",
          elapsedMs: elapsed(),
        };
      }

      if (result.verdict === "block") stop("block");
      return {
        ...base,
        status: "answered",
        answer: result,
        elapsedMs: elapsed(),
      };
    } catch (error) {
      return {
        ...base,
        status: "error",
        error: errorText(error),
        elapsedMs: elapsed(),
      };
    }
  };

  const report = async (delegate: GuardrailsDelegate, index: number) => {
    const outcome = await run(delegate);
    try {
      options.onOutcome?.(index, outcome);
    } catch {}
    return outcome;
  };

  try {
    return await Promise.all(delegates.map(report));
  } finally {
    stop("abort");
    options.signal?.removeEventListener("abort", forwardAbort);
  }
}

export async function delegateDecision(
  pi: ExtensionAPI,
  roster: DelegateRoster,
  request: DelegationRequest,
  ctx: DelegationCtx,
  options: { timeoutMs: number },
): Promise<DelegatedDecision | undefined> {
  const delegates = roster.list();
  if (delegates.length === 0) return undefined;

  const startedAt = performance.now();
  const progress =
    ctx.mode === "tui" && ctx.ui
      ? new DelegationProgress(request, delegates.length, options.timeoutMs)
      : undefined;
  const board = delegationBoard();
  const progressId = randomUUID();
  if (progress && ctx.ui) board.add(progressId, progress, ctx.ui);

  let outcomes: DelegateOutcome[];
  try {
    outcomes = await runDelegates(
      delegates,
      request,
      {
        cwd: ctx.cwd,
        sessionManager: ctx.sessionManager,
        modelRegistry: ctx.modelRegistry,
      },
      {
        timeoutMs: options.timeoutMs,
        signal: ctx.signal,
        onOutcome: (index, outcome) => {
          if (!progress) return;
          progress.update(index, outcome);
        },
      },
    );
  } finally {
    if (progress) board.remove(progressId);
  }
  const result = combineDelegateOutcomes(outcomes);

  const decision: DelegatedDecision = {
    feature: request.feature,
    toolName: request.toolName,
    action: request.action,
    flaggedReason: request.reason,
    verdict: result.verdict,
    reason: result.reason,
    outcomes: result.outcomes,
    elapsedMs: Math.round(performance.now() - startedAt),
  };

  pi.appendEntry<DelegatedDecision>(DELEGATION_ENTRY_TYPE, decision);
  const payload: GuardrailsDecisionDelegatedPayload = {
    source: "guardrails",
    timestamp: new Date().toISOString(),
    ...decision,
  };
  pi.events.emit(GUARDRAILS_DECISION_DELEGATED_EVENT, payload);

  return decision;
}
