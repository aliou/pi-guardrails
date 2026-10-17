import { resolveFromCwd } from "../../src/core/paths";
import { extractBashPathCandidates } from "../../src/shared/paths";

/** Tools that only read. Bash is never read-only: a command can write. */
const READ_ONLY_TOOLS = new Set(["read", "grep", "find", "ls"]);

export function isReadOnlyTool(toolName: string): boolean {
  return READ_ONLY_TOOLS.has(toolName);
}

export async function targetsForTool(
  toolName: string,
  input: Record<string, unknown>,
  cwd: string,
): Promise<string[]> {
  if (["read", "write", "edit", "grep", "find", "ls"].includes(toolName)) {
    const raw = String(input.file_path ?? input.path ?? "").trim();
    return raw ? [resolveFromCwd(raw, cwd)] : [];
  }

  if (toolName === "bash") {
    return extractBashPathCandidates(String(input.command ?? ""), cwd);
  }

  return [];
}
