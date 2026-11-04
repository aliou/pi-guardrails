import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

// Answers Guardrails prompts from outside the terminal. Each open prompt is
// written to <dir>/<promptId>.json; writing "allow" or "deny" to
// <dir>/<promptId>.answer answers that prompt, and only that prompt. A chat
// bridge (Slack, Telegram, …) has the same shape: post the request, wait for
// a reply bound to the prompt ID, stop waiting once the signal aborts.

const POLL_MS = 500;

interface PromptResponseRequest {
  promptId: string;
  reason: string;
  action: { kind: "command"; command: string } | { kind: "file"; path: string };
  choices: readonly string[];
}

function sleep(ms: number, signal: AbortSignal): Promise<boolean> {
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

export function approvalDir(): string {
  return (
    process.env.GUARDRAILS_APPROVAL_DIR ??
    join(tmpdir(), "guardrails-approvals")
  );
}

export default function remoteApproval(pi: ExtensionAPI) {
  const delegate = {
    id: "example:remote-approval",
    name: "remote-approval",
    async respond(
      request: PromptResponseRequest,
      context: { signal: AbortSignal },
    ) {
      const dir = approvalDir();
      const requestFile = join(dir, `${request.promptId}.json`);
      const answerFile = join(dir, `${request.promptId}.answer`);
      await mkdir(dir, { recursive: true });
      await writeFile(
        requestFile,
        JSON.stringify(
          {
            reason: request.reason,
            action: request.action,
            choices: request.choices,
          },
          null,
          2,
        ),
      );

      try {
        while (await sleep(POLL_MS, context.signal)) {
          const answer = await readFile(answerFile, "utf8").catch(
            () => undefined,
          );
          const choice = answer?.trim();
          if (choice && request.choices.includes(choice)) {
            return { choice, reason: `answered in ${answerFile}` };
          }
        }
        return undefined;
      } finally {
        await rm(requestFile, { force: true });
        await rm(answerFile, { force: true });
      }
    },
  };

  const register = () =>
    pi.events.emit("guardrails:delegate:register", { delegate });
  pi.events.on("guardrails:delegate:request", register);
  register();
}
