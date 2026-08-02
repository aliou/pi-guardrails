import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { parse } from "@aliou/sh";
import {
  expandHomePath,
  isWithinBoundary,
  maybePathLike,
} from "../../core/paths/path";
import {
  commandCreatesPaths,
  hasNonPathShape,
  hasShellExpansion,
  isImplausibleLocalPath,
} from "../../core/paths/plausibility";
import { walkCommands, wordToString } from "../../core/shell/ast";
import {
  classifyCommandArgs,
  isInterpreterCommand,
} from "../../core/shell/command-args";
import { expandGlob, hasGlobChars } from "../glob";

async function expandCandidate(
  candidate: string,
  cwd: string,
): Promise<string[]> {
  if (!hasGlobChars(candidate)) return [candidate];
  const matches = await expandGlob(candidate, { cwd });
  return matches.length > 0 ? matches : [candidate];
}

/** Maximum nesting depth for recursive shell -c parsing. */
const MAX_SHELL_DEPTH = 3;

export type ExtractOptions = {
  /** Nesting level for recursive shell `-c` parsing. Internal. */
  depth?: number;
  /** Filesystem existence probe. Injectable for tests. */
  pathExists?: (path: string) => boolean;
};

/**
 * Extract path-like candidates from a bash command string.
 * Returns absolute paths. Best-effort: uses AST parsing with regex fallback.
 * Does NOT filter by any policy — returns all path-like arguments.
 *
 * Outside-workspace candidates are filtered by shape and filesystem
 * plausibility (see `core/paths/plausibility`) so that identifier arguments
 * such as `ctx7 docs /websites/apisix` do not read as filesystem access.
 * In-workspace candidates are returned unfiltered: `checkPathAccess` allows
 * them regardless, so noise there is cheaper than another heuristic.
 *
 * `depth` bounds recursion into nested shell `-c` programs to prevent
 * stack exhaustion on deeply nested agent-controlled commands.
 */
export async function extractBashPathCandidates(
  command: string,
  cwd: string,
  options: ExtractOptions = {},
): Promise<string[]> {
  const { depth = 0, pathExists = existsSync } = options;
  const seen = new Set<string>();
  const results: string[] = [];

  const addCandidate = async (
    token: string,
    forcePath = false,
    commandName?: string,
    commandArgs: string[] = [],
  ): Promise<void> => {
    if (!token || token.startsWith("-")) return;
    if (!forcePath && !maybePathLike(token)) return;
    if (!forcePath && hasNonPathShape(token)) return;

    // Suppression is skipped whenever the filesystem cannot settle the
    // question: the command creates missing parents itself (known
    // path-creating commands, looked up through wrappers such as `sudo` or
    // `npx`), the command runs an arbitrary program, or the token still
    // contains an unexpanded shell reference.
    const skipImplausible =
      forcePath ||
      hasShellExpansion(token) ||
      commandCreatesPaths(commandName, commandArgs) ||
      (commandName !== undefined && isInterpreterCommand(commandName));

    const expanded = await expandCandidate(token, cwd);
    for (const file of expanded) {
      const abs = resolve(cwd, expandHomePath(file));
      // Only outside-workspace candidates are filtered: in-workspace paths are
      // always allowed downstream, so noise there cannot cause a prompt.
      if (
        !skipImplausible &&
        !isWithinBoundary(abs, cwd) &&
        isImplausibleLocalPath(abs, pathExists)
      ) {
        continue;
      }
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
      const commandName = words[0];
      if (commandName) {
        for (const arg of classifyCommandArgs(commandName, words.slice(1))) {
          if (arg.recurseShell) {
            if (depth >= MAX_SHELL_DEPTH) continue;
            pending.push(
              extractBashPathCandidates(arg.token, cwd, {
                depth: depth + 1,
                pathExists,
              }).then((nested) => {
                for (const abs of nested) {
                  if (!seen.has(abs)) {
                    seen.add(abs);
                    results.push(abs);
                  }
                }
              }),
            );
          } else {
            pending.push(
              addCandidate(
                arg.token,
                arg.forcePath,
                commandName,
                words.slice(1),
              ),
            );
          }
        }
      } else {
        // Subshell fragments (e.g. the `\( ... \)` group of a find
        // expression) arrive as commands with no name: the "words" are
        // flags, patterns, and shell punctuation, not paths. Only keep
        // tokens that look like real paths; skip lone `\` from escaped
        // parens, which resolves to the drive root on Windows (issue #79).
        for (const word of words) {
          if (word === "\\" || word === "(" || word === ")" || word === "!")
            continue;
          if (word.startsWith("-") && word !== "-" && word !== "--") continue;
          pending.push(addCandidate(word));
        }
      }
      for (const redir of cmd.redirects ?? []) {
        pending.push(addCandidate(wordToString(redir.target), true));
      }
      return false;
    });

    await Promise.all(pending);
    return results;
  } catch {
    // Fallback: regex tokenization. The command name is unreliable here, so
    // only shape rejection applies; existence suppression stays off to keep
    // the fallback fail-safe (extra candidates, never fewer).
    const tokenRegex = /"([^"]+)"|'([^']+)'|`([^`]+)`|([^\s"'`<>|;&]+)/g;
    for (const match of command.matchAll(tokenRegex)) {
      const token = match[1] ?? match[2] ?? match[3] ?? match[4] ?? "";
      if (
        token &&
        !token.startsWith("-") &&
        maybePathLike(token) &&
        !hasNonPathShape(token)
      ) {
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
