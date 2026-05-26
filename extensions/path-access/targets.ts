import { resolveFromCwd } from "../../src/core/paths";
import type { IgnoredBashArgRule } from "../../src/shared/config";
import { extractBashPathCandidates } from "../../src/shared/paths";

export async function targetsForTool(
  toolName: string,
  input: Record<string, unknown>,
  cwd: string,
  ignoredBashArgs: IgnoredBashArgRule[] = [],
): Promise<string[]> {
  if (["read", "write", "edit", "grep", "find", "ls"].includes(toolName)) {
    const raw = String(input.file_path ?? input.path ?? "").trim();
    return raw ? [resolveFromCwd(raw, cwd)] : [];
  }

  if (toolName === "bash") {
    return extractBashPathCandidates(
      String(input.command ?? ""),
      cwd,
      ignoredBashArgs,
    );
  }

  return [];
}
