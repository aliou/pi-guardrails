import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { setupGuardrailsHooks } from "./hooks";

/**
 * Guardrails Extension
 *
 * Security hooks to prevent potentially dangerous operations:
 * - prevent-brew: Blocks Homebrew commands (project uses Nix)
 * - protect-env-files: Prevents access to .env files (except .example/.sample/.test)
 * - permission-gate: Prompts for confirmation on dangerous commands
 */
export default function (pi: ExtensionAPI) {
  setupGuardrailsHooks(pi);
}
