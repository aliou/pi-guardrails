import type { DelegateRoster } from "./roster";
import type {
  DelegationContext,
  GuardrailsDelegate,
  PromptChoice,
  PromptResponse,
  PromptResponseRequest,
} from "./types";

export type PromptRaceOutcome<T> =
  | { by: "local"; result: T; elapsedMs: number }
  | {
      by: "responder";
      responder: { id: string; name: string };
      response: PromptResponse;
      elapsedMs: number;
    }
  | { by: "timeout"; elapsedMs: number };

export interface RacePromptOptions<T> {
  /** Deny after this many milliseconds without an answer. 0 waits forever. */
  timeoutMs: number;
  /**
   * Shows the local prompt. It must settle once `signal` aborts, which
   * happens when a responder answers or the timeout passes.
   */
  local(signal: AbortSignal): Promise<T>;
}

export function isPromptResponse(
  value: unknown,
  choices: readonly PromptChoice[],
): value is PromptResponse {
  if (!value || typeof value !== "object") return false;
  const response = value as Record<string, unknown>;
  return (
    typeof response.choice === "string" &&
    (choices as readonly string[]).includes(response.choice) &&
    typeof response.reason === "string"
  );
}

/** Enabled delegates that can answer an open prompt. */
export function listResponders(roster: DelegateRoster): GuardrailsDelegate[] {
  return roster
    .list()
    .filter((delegate) => typeof delegate.respond === "function");
}

/**
 * Shows the local prompt while every responder is asked in parallel. The
 * first answer wins, from the local user, a responder, or the timeout;
 * everything else is dismissed or aborted. Responders that abstain, throw,
 * or answer something the prompt does not accept are ignored.
 */
export function racePrompt<T>(
  responders: readonly GuardrailsDelegate[],
  request: PromptResponseRequest,
  ctx: Omit<DelegationContext, "signal">,
  options: RacePromptOptions<T>,
): Promise<PromptRaceOutcome<T>> {
  const controller = new AbortController();
  const startedAt = performance.now();
  const elapsedMs = () => Math.round(performance.now() - startedAt);
  const context: DelegationContext = { ...ctx, signal: controller.signal };

  return new Promise<PromptRaceOutcome<T>>((resolve, reject) => {
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const settle = (finish: () => void) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      controller.abort();
      finish();
    };

    if (options.timeoutMs > 0) {
      timer = setTimeout(
        () => settle(() => resolve({ by: "timeout", elapsedMs: elapsedMs() })),
        options.timeoutMs,
      );
    }

    for (const responder of responders) {
      Promise.resolve()
        .then(() => responder.respond?.(request, context))
        .then(
          (response) => {
            if (!isPromptResponse(response, request.choices)) return;
            settle(() =>
              resolve({
                by: "responder",
                responder: { id: responder.id, name: responder.name },
                response,
                elapsedMs: elapsedMs(),
              }),
            );
          },
          () => {
            // A failing responder leaves the prompt to everyone else.
          },
        );
    }

    Promise.resolve()
      .then(() => options.local(controller.signal))
      .then(
        (result) =>
          settle(() =>
            resolve({ by: "local", result, elapsedMs: elapsedMs() }),
          ),
        (error) => settle(() => reject(error)),
      );
  });
}

/**
 * Wraps a `ctx.ui.custom()` component factory so the component closes with
 * `value` once `signal` aborts.
 */
export function dismissOnAbort<Tui, Theme, Keybindings, T, R>(
  factory: (
    tui: Tui,
    theme: Theme,
    keybindings: Keybindings,
    done: (result: T) => void,
  ) => R,
  signal: AbortSignal,
  value: T,
): (
  tui: Tui,
  theme: Theme,
  keybindings: Keybindings,
  done: (result: T) => void,
) => R {
  return (tui, theme, keybindings, done) => {
    let closed = false;
    const close = (result: T) => {
      if (closed) return;
      closed = true;
      signal.removeEventListener("abort", dismiss);
      done(result);
    };
    const dismiss = () => queueMicrotask(() => close(value));
    if (signal.aborted) dismiss();
    else signal.addEventListener("abort", dismiss, { once: true });
    return factory(tui, theme, keybindings, close);
  };
}

/** A prompt timeout for people: `45s`, `5m`, `2m 30s`. */
export function formatDuration(ms: number): string {
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return rest === 0 ? `${minutes}m` : `${minutes}m ${rest}s`;
}

/** One line for the prompt footer naming who else can answer and the timeout. */
export function promptWaitHint(
  responders: readonly Pick<GuardrailsDelegate, "name">[],
  timeoutMs: number,
): string | undefined {
  const parts: string[] = [];
  if (responders.length > 0) {
    parts.push(
      `Also waiting on ${responders.map((r) => r.name).join(", ")}; the first answer wins.`,
    );
  }
  if (timeoutMs > 0) {
    parts.push(`Denied after ${formatDuration(timeoutMs)} without an answer.`);
  }
  return parts.length > 0 ? parts.join(" ") : undefined;
}
