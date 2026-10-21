import { existsSync } from "node:fs";
import { parse as parsePath, resolve } from "node:path";
import { parse, type SimpleCommand, type Word } from "@aliou/sh";
import {
  expandHomePath,
  isWithinBoundary,
  maybePathLike,
} from "../../core/paths/path";
import {
  commandCreatesPaths,
  hasNonPathShape,
  isImplausibleLocalPath,
} from "../../core/paths/plausibility";
import { toClassifiedArgs } from "../../core/shell/argv-roles";
import {
  type CommandScope,
  isFdDuplicationRedirect,
  isHeredocRedirect,
  walkCommands,
  wordHasExpansion,
  wordToString,
} from "../../core/shell/ast";
import { expandGlob, hasGlobChars } from "../glob";

async function expandCandidate(
  candidate: string,
  cwd: string,
): Promise<string[]> {
  if (!hasGlobChars(candidate)) return [candidate];
  const matches = await expandGlob(candidate, { cwd });
  return matches.length > 0 ? matches : [candidate];
}

/**
 * Directory a `cd` moves to, resolved against `dir`. Returns `undefined` when
 * the command leaves the directory unchanged (bad arity), and the session cwd
 * when the target cannot be tracked (`cd -`, expansions, globs, option-like
 * operands) so that later relative paths fall back to legacy resolution
 * instead of a fabricated base.
 */
function nextCdDir(
  cmd: SimpleCommand,
  dir: string,
  sessionCwd: string,
): string | undefined {
  const words = cmd.words ?? [];
  if (!words[0] || wordToString(words[0]) !== "cd") return undefined;
  const operands = words.slice(1).filter((word: Word) => {
    const text = wordToString(word);
    return text !== "-L" && text !== "-P" && text !== "--";
  });
  if (operands.length === 0) return expandHomePath("~");
  if (operands.length > 1) return undefined;
  const word = operands[0];
  const text = wordToString(word);
  if (text === "-" || text.startsWith("-")) return sessionCwd;
  if (wordHasExpansion(word) || hasGlobChars(text)) return sessionCwd;
  return resolve(dir, expandHomePath(text));
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
  const scopeDirs = new Map<CommandScope, string>();
  const dirFor = (scope: CommandScope): string => {
    const known = scopeDirs.get(scope);
    if (known !== undefined) return known;
    const inherited = scope.parent ? dirFor(scope.parent) : cwd;
    scopeDirs.set(scope, inherited);
    return inherited;
  };

  const addCandidate = async (
    token: string,
    dir: string,
    forcePath = false,
    commandName?: string,
    commandArgs: string[] = [],
    programText = false,
    mayExpand = false,
  ): Promise<void> => {
    if (!token || token.startsWith("-")) return;
    if (!forcePath && !maybePathLike(token)) return;
    if (!forcePath && hasNonPathShape(token)) return;

    // Suppression is skipped when the token may create its missing parent,
    // or when shell expansion means the filesystem cannot settle it yet.
    const skipImplausible =
      forcePath ||
      mayExpand ||
      commandCreatesPaths(commandName, commandArgs) ||
      programText;

    const expanded = await expandCandidate(token, dir);
    for (const file of expanded) {
      const abs = resolve(dir, expandHomePath(file));
      // Tokens with repeated separators (`//`, `cat .//`) collapse to the
      // filesystem root, which is never a meaningful prompt target.
      if (parsePath(abs).root === abs) continue;
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

    walkCommands(
      ast,
      (cmd, redirects, scope) => {
        const activeScope: CommandScope = scope ?? { parent: undefined };
        let dir = dirFor(activeScope);
        // Expansion is decided per source word from its AST parts, not from
        // the flattened token: `wordToString` flattens quoting away, so the
        // `$p` in a single-quoted sed range (`'/pat/,$p'`) is literal text
        // that a token-level check would misread as an unexpanded variable.
        // Key the flattened form so classified arguments can be looked up.
        const wordList = cmd?.words ?? [];
        const expandedTokens = new Set<string>();
        for (const word of wordList) {
          if (wordHasExpansion(word)) expandedTokens.add(wordToString(word));
        }
        for (const redir of redirects ?? []) {
          // Fd duplications (`2>&1`, `<&-`) have no filesystem target.
          // `&>`/`&>>` redirect stdout AND stderr to a real path — keep those.
          if (isFdDuplicationRedirect(redir)) continue;
          // Heredoc delimiters and here-strings are text, not file targets.
          if (isHeredocRedirect(redir)) continue;
          pending.push(addCandidate(wordToString(redir.target), dir, true));
        }
        const commandName = wordList[0] ? wordToString(wordList[0]) : "";
        if (commandName) {
          for (const arg of toClassifiedArgs(commandName, wordList.slice(1))) {
            if (arg.recurseShell) {
              if (depth >= MAX_SHELL_DEPTH) continue;
              pending.push(
                extractBashPathCandidates(arg.token, dir, {
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
                  dir,
                  arg.forcePath,
                  commandName,
                  wordList.slice(1).map(wordToString),
                  arg.programText,
                  expandedTokens.has(arg.token),
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
          for (const word of wordList) {
            const text = wordToString(word);
            if (text === "\\" || text === "(" || text === ")" || text === "!")
              continue;
            if (text.startsWith("-") && text !== "-" && text !== "--") continue;
            pending.push(
              addCandidate(
                text,
                dir,
                false,
                undefined,
                [],
                false,
                expandedTokens.has(text),
              ),
            );
          }
        }
        if (cmd && wordToString(cmd.words?.[0] ?? wordList[0] ?? "") === "cd") {
          const next = nextCdDir(cmd, dir, cwd);
          if (next !== undefined) {
            scopeDirs.set(activeScope, next);
            dir = next;
          }
        }
        return false;
      },
      { includeSubstitutions: true },
    );

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
