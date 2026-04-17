import { resolve } from "node:path";
import { parse } from "@aliou/sh";
import { expandGlob, hasGlobChars } from "./glob-expander";
import { expandHomePath } from "./path";
import { walkCommands, wordToString } from "./shell-utils";

/**
 * Heuristic: is this token likely a filesystem path?
 * Intentionally conservative — only structural signals.
 * Known false positives: "application/json", URL paths. These cause
 * spurious prompts in ask mode but are safe (better to over-prompt than miss).
 * Known false negatives: bare filenames without path separators (e.g. "README.md").
 * These are usually cwd-relative and would pass the boundary check anyway.
 */
function maybePathLike(token: string): boolean {
  if (token.includes("/")) return true;
  if (token.includes("\\")) return true;
  if (/^[A-Za-z]:[\\/]/.test(token)) return true;
  if (token.startsWith("~")) return true;
  return false;
}

async function expandCandidate(
  candidate: string,
  cwd: string,
): Promise<string[]> {
  if (!hasGlobChars(candidate)) return [candidate];
  const matches = await expandGlob(candidate, { cwd });
  return matches.length > 0 ? matches : [candidate];
}

/**
 * Extract path-like candidates from a bash command string.
 * Returns absolute paths. Best-effort: uses AST parsing with regex fallback.
 * Does NOT filter by any policy — returns all path-like arguments.
 */
export async function extractBashPathCandidates(
  command: string,
  cwd: string,
): Promise<string[]> {
  const seen = new Set<string>();
  const results: string[] = [];

  const addCandidate = async (
    token: string,
    forcePath = false,
  ): Promise<void> => {
    if (!token || token.startsWith("-")) return;
    if (!forcePath && !maybePathLike(token)) return;

    const expanded = await expandCandidate(token, cwd);
    for (const file of expanded) {
      const abs = resolve(cwd, expandHomePath(file));
      if (!seen.has(abs)) {
        seen.add(abs);
        results.push(abs);
      }
    }
  };

  try {
    const { ast } = parse(command);
    const pending: Promise<void>[] = [];

    walkCommands(ast, (cmd) => {
      const words = (cmd.words ?? []).map(wordToString);
      for (let i = 1; i < words.length; i++) {
        pending.push(addCandidate(words[i] as string));
      }
      for (const redir of cmd.redirects ?? []) {
        pending.push(addCandidate(wordToString(redir.target), true));
      }
      return false;
    });

    await Promise.all(pending);
    return results;
  } catch {
    // Fallback: regex tokenization
    const tokenRegex = /"([^"]+)"|'([^']+)'|`([^`]+)`|([^\s"'`<>|;&]+)/g;
    for (const match of command.matchAll(tokenRegex)) {
      const token = match[1] ?? match[2] ?? match[3] ?? match[4] ?? "";
      if (token && !token.startsWith("-") && maybePathLike(token)) {
        const expanded = await expandCandidate(token, cwd);
        for (const file of expanded) {
          const abs = resolve(cwd, expandHomePath(file));
          if (!seen.has(abs)) {
            seen.add(abs);
            results.push(abs);
          }
        }
      }
    }
    return results;
  }
}
