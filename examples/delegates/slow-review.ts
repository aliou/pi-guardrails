import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const REVIEW_MS = 1500;

function wait(ms: number, signal: AbortSignal): Promise<boolean> {
  return new Promise((resolve) => {
    if (signal.aborted) return resolve(false);
    const timer = setTimeout(() => resolve(true), ms);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        resolve(false);
      },
      { once: true },
    );
  });
}

export default function slowReview(pi: ExtensionAPI) {
  const delegate = {
    id: "example:slow-review",
    name: "slow-review",
    async decide(_request: unknown, context: { signal: AbortSignal }) {
      const finished = await wait(REVIEW_MS, context.signal);
      if (!finished) return undefined;
      return { verdict: "allow", reason: "matches an approved change" };
    },
  };

  const register = () =>
    pi.events.emit("guardrails:delegate:register", { delegate });
  pi.events.on("guardrails:delegate:request", register);
  register();
}
