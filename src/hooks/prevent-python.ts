import { parse } from "@aliou/sh";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import type { ResolvedConfig } from "../config-schema";
import { emitBlocked } from "../events";
import { walkCommands, wordToString } from "../shell-utils";

/**
 * Blocks all Python-related commands including python, python3, pip, poetry, etc.
 * Use uv for Python package management instead.
 *
 * Uses AST-based matching. `venv` is not checked as a command name -- it is
 * only used as `python -m venv`, so matching on `python` is sufficient.
 */

const PYTHON_COMMANDS = new Set([
  "python",
  "python3",
  "pip",
  "pip3",
  "poetry",
  "pyenv",
  "virtualenv",
]);

const PYTHON_PATTERN = /\b(python|python3|pip|pip3|poetry|pyenv|virtualenv)\b/;

export function setupPreventPythonHook(
  pi: ExtensionAPI,
  config: ResolvedConfig,
) {
  if (!config.features.preventPython) return;

  pi.on("tool_call", async (event, ctx) => {
    if (event.toolName !== "bash") return;

    const command = String(event.input.command ?? "");

    let hasPython = false;
    try {
      const { ast } = parse(command);
      walkCommands(ast, (cmd) => {
        const name = cmd.words?.[0] ? wordToString(cmd.words[0]) : undefined;
        if (name && PYTHON_COMMANDS.has(name)) {
          hasPython = true;
          return true;
        }
        return false;
      });
    } catch {
      hasPython = PYTHON_PATTERN.test(command);
    }

    if (hasPython) {
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
