import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
  GUARDRAILS_ACTION_PROMPT_RESOLVED_EVENT,
  GUARDRAILS_ACTION_PROMPTED_EVENT,
} from "../../src/shared/events";

const HERDR_BLOCKED_EVENT = "herdr:blocked";
const BLOCKED_LABEL = "Guardrails approval required";

export default function herdrIntegration(pi: ExtensionAPI) {
  pi.events.on(GUARDRAILS_ACTION_PROMPTED_EVENT, () => {
    pi.events.emit(HERDR_BLOCKED_EVENT, {
      active: true,
      label: BLOCKED_LABEL,
    });
  });

  pi.events.on(GUARDRAILS_ACTION_PROMPT_RESOLVED_EVENT, () => {
    pi.events.emit(HERDR_BLOCKED_EVENT, { active: false });
  });
}
