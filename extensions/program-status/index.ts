import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
  formatProgramStatus,
  type ProgramStatus,
} from "@earendil-works/pi-tui";
import {
  GUARDRAILS_PROMPT_CLOSED_EVENT,
  GUARDRAILS_PROMPT_OPENED_EVENT,
  type GuardrailsPromptClosedPayload,
  type GuardrailsPromptOpenedPayload,
} from "../../src/shared/events";

const APP_NAME = "pi";
const BLOCKED_MESSAGE = "Guardrails approval required";

function writeProgramStatus(status: ProgramStatus): void {
  if (!process.stdout.isTTY) return;
  if (process.env.PI_PROGRAM_STATUS === "0") return;
  process.stdout.write(formatProgramStatus(status));
}

export default function programStatus(pi: ExtensionAPI): void {
  const activePrompts = new Set<string>();

  const stopListeningForOpened = pi.events.on(
    GUARDRAILS_PROMPT_OPENED_EVENT,
    (data) => {
      const payload = data as GuardrailsPromptOpenedPayload | undefined;
      const id = payload?.prompt?.id;
      if (!id || activePrompts.has(id)) return;

      activePrompts.add(id);
      if (activePrompts.size > 1) return;

      writeProgramStatus({
        state: "blocked",
        kind: "permission",
        app: APP_NAME,
        message: BLOCKED_MESSAGE,
      });
    },
  );

  const stopListeningForClosed = pi.events.on(
    GUARDRAILS_PROMPT_CLOSED_EVENT,
    (data) => {
      const payload = data as GuardrailsPromptClosedPayload | undefined;
      const id = payload?.prompt?.id;
      if (!id || !activePrompts.delete(id)) return;
      if (activePrompts.size > 0) return;

      writeProgramStatus({
        state: "working",
        app: APP_NAME,
        message: pi.getSessionName(),
      });
    },
  );

  pi.on("session_shutdown", () => {
    activePrompts.clear();
    stopListeningForOpened();
    stopListeningForClosed();
  });
}
