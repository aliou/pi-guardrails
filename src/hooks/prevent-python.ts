import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import type { ResolvedConfig } from "../config-schema";
import { emitBlocked } from "../events";

/**
 * Blocks all Python-related commands including python, python3, pip, poetry, etc.
 * Use uv for Python package management instead.
 */

const PYTHON_PATTERN =
  /\b(python|python3|pip|pip3|poetry|pyenv|virtualenv|venv)\b/;

export function setupPreventPythonHook(
  pi: ExtensionAPI,
  config: ResolvedConfig,
) {
  if (!config.features.preventPython) return;

  pi.on("tool_call", async (event, ctx) => {
    if (event.toolName !== "bash") return;

    const command = String(event.input.command ?? "");

    if (PYTHON_PATTERN.test(command)) {
      ctx.ui.notify("Blocked Python command. Use uv instead.", "warning");

      const reason =
        "Python is not available globally on this machine. " +
        "Use uv for Python package management instead. " +
        "Run `uv init` to create a new Python project, " +
        "or `uv run python` to run Python scripts. " +
        "Use `uv add` to install packages (replaces pip/poetry).";

      emitBlocked(pi, {
        feature: "preventPython",
        toolName: "bash",
        input: event.input,
        reason,
      });

      return { block: true, reason };
    }
    return;
  });
}
