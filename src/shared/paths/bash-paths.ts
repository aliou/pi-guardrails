import { existsSync } from "node:fs";
import { parse as parsePath, resolve } from "node:path";
import { parse } from "@aliou/sh";
import {
  expandHomePath,
  isWithinBoundary,
  maybePathLike,
} from "../../core/paths/path";
import {
  cannotBeCreated,
  commandCreatesPaths,
  hasNonPathShape,
  isImplausibleLocalPath,
  isWritableDirectory,
  runsElevated,
} from "../../core/paths/plausibility";
import {
  isFdDuplicationRedirect,
  isHeredocRedirect,
  walkCommands,
  wordHasExpansion,
  wordToString,
} from "../../core/shell/ast";
import { trackCdChains } from "../../core/shell/cd";
import { classifyCommandArgs } from "../../core/shell/command-args";
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
  /** Directory writability probe. Injectable for tests. */
  isWritable?: (dir: string) => boolean;
  /**
   * Workspace root for the outside-workspace filter. Defaults to `cwd`.
   * Internal: nested shell programs run in the directory a preceding `cd`
   * selected, which is not necessarily the workspace root.
   */
  workspace?: string;
};

type CandidateOptions = {
  /** Directory relative tokens resolve against. */
  dir: string;
  forcePath?: boolean;
  commandName?: string;
  commandArgs?: string[];
  programText?: boolean;
  mayExpand?: boolean;
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
 * Relative tokens resolve against the directory selected by a preceding
 * `cd` in the same `&&` chain (see `trackCdChains`), and against `cwd`
 * everywhere else.
 *
 * `depth` bounds recursion into nested shell `-c` programs to prevent
 * stack exhaustion on deeply nested agent-controlled commands.
 */
export async function extractBashPathCandidates(
  command: string,
  cwd: string,
  options: ExtractOptions = {},
): Promise<string[]> {
  const {
    depth = 0,
    pathExists = existsSync,
    isWritable = isWritableDirectory,
    workspace = cwd,
  } = options;
  const seen = new Set<string>();
  const results: string[] = [];

  const addCandidate = async (
    token: string,
    {
      dir,
      forcePath = false,
      commandName,
      commandArgs = [],
      programText = false,
      mayExpand = false,
    }: CandidateOptions,
  ): Promise<void> => {
    if (!token || token.startsWith("-")) return;
    if (!forcePath && !maybePathLike(token)) return;
    if (!forcePath && hasNonPathShape(token)) return;

    // Suppression is skipped when the token may create its missing parent,
    // or when shell expansion means the filesystem cannot settle it yet.
    const skipImplausible =
      forcePath || mayExpand || commandCreatesPaths(commandName, commandArgs);
    // An elevated command can write where this process cannot.
    const canWrite = runsElevated(commandName, commandArgs)
      ? () => true
      : isWritable;

    const expanded = await expandCandidate(token, dir);
    for (const file of expanded) {
      const abs = resolve(dir, expandHomePath(file));
      // Tokens with repeated separators (`//`, `cat .//`) collapse to the
      // filesystem root, which is never a meaningful prompt target.
      if (parsePath(abs).root === abs) continue;
      // Only outside-workspace candidates are filtered: in-workspace paths are
      // always allowed downstream, so noise there cannot cause a prompt.
      // Interpreter programs can create any missing parents themselves, so
      // only a path no writable ancestor can hold is ruled out for them.
      if (
        !skipImplausible &&
        !isWithinBoundary(abs, workspace) &&
        (programText
          ? cannotBeCreated(abs, pathExists, canWrite)
          : isImplausibleLocalPath(abs, pathExists, canWrite))
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
    const commandDirs = trackCdChains(ast, cwd, command);

    walkCommands(
      ast,
      (cmd, redirects) => {
        const dir = (cmd && commandDirs.get(cmd)) ?? cwd;
        // Expansion is decided per source word from its AST parts, not from
        // the flattened token: `wordToString` flattens quoting away, so the
        // `$p` in a single-quoted sed range (`'/pat/,$p'`) is literal text
        // that a token-level check would misread as an unexpanded variable.
        // Key the flattened form so classified arguments can be looked up.
        const expandedTokens = new Set<string>();
        for (const word of cmd?.words ?? []) {
          if (wordHasExpansion(word)) expandedTokens.add(wordToString(word));
        }
        for (const redir of redirects ?? []) {
          // Fd duplications (`2>&1`, `<&-`) have no filesystem target.
          // `&>`/`&>>` redirect stdout AND stderr to a real path — keep those.
          if (isFdDuplicationRedirect(redir)) continue;
          // Heredoc delimiters and here-strings are text, not file targets.
          if (isHeredocRedirect(redir)) continue;
          pending.push(
            addCandidate(wordToString(redir.target), { dir, forcePath: true }),
          );
        }
        const words = (cmd?.words ?? []).map(wordToString);
        const commandName = words[0];
        if (commandName) {
          for (const arg of classifyCommandArgs(commandName, words.slice(1))) {
            if (arg.recurseShell) {
              if (depth >= MAX_SHELL_DEPTH) continue;
              pending.push(
                extractBashPathCandidates(arg.token, dir, {
                  depth: depth + 1,
                  pathExists,
                  isWritable,
                  workspace,
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
                addCandidate(arg.token, {
                  dir,
                  forcePath: arg.forcePath,
                  commandName,
                  commandArgs: words.slice(1),
                  programText: arg.programText,
                  mayExpand: expandedTokens.has(arg.token),
                }),
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
            pending.push(
              addCandidate(word, {
                dir,
                mayExpand: expandedTokens.has(word),
              }),
            );
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
