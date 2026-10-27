import { existsSync } from "node:fs";
import { parse as parsePath, resolve } from "node:path";
import { parse, type Statement, type Word } from "@aliou/sh";
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
import {
  type CommandCallback,
  isFdDuplicationRedirect,
  isHeredocRedirect,
  walkCommands,
  wordHasExpansion,
  wordToString,
} from "../../core/shell/ast";
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

const CD_FLAGS = new Set(["-L", "-P", "-e", "-@"]);

function cdOperands(args: Word[]): Word[] | undefined {
  const first = args.findIndex((word) => !CD_FLAGS.has(wordToString(word)));
  if (first === -1) return [];
  const text = wordToString(args[first]);
  if (text === "--") return args.slice(first + 1);
  if (/^-./.test(text)) return undefined;
  return args.slice(first);
}

function cdTarget(
  word: Word,
  dir: string,
  pathExists: (path: string) => boolean,
): string | undefined {
  const text = wordToString(word);
  if (text === "-" || wordHasExpansion(word) || hasGlobChars(text)) {
    return undefined;
  }
  const target = resolve(dir, expandHomePath(text));
  return pathExists(target) ? target : undefined;
}

function nextCdDir(
  args: Word[],
  dir: string,
  sessionCwd: string,
  pathExists: (path: string) => boolean,
): string | undefined {
  const operands = cdOperands(args);
  if (operands === undefined) return sessionCwd;
  if (operands.length === 0) return expandHomePath("~");
  if (operands.length > 1) return undefined;
  return cdTarget(operands[0], dir, pathExists) ?? sessionCwd;
}

function flattenAndChains(stmts: Statement[]): Statement[] {
  const out: Statement[] = [];
  const visit = (stmt: Statement): void => {
    if (stmt.command.type === "Logical" && stmt.command.op === "and") {
      visit(stmt.command.left);
      visit(stmt.command.right);
      return;
    }
    out.push(stmt);
  };
  for (const stmt of stmts) visit(stmt);
  return out;
}

function cdWords(stmt: Statement): Word[] | undefined {
  if (stmt.background || stmt.negated) return undefined;
  const cmd = stmt.command;
  if (cmd.type !== "SimpleCommand") return undefined;
  const words = cmd.words ?? [];
  const first = words[0];
  return first !== undefined && wordToString(first) === "cd"
    ? words.slice(1)
    : undefined;
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
    let dir = cwd;

    const onCommand: CommandCallback = (cmd, redirects) => {
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
      const words = wordList.map(wordToString);
      const commandName = words[0];
      if (commandName) {
        for (const arg of classifyCommandArgs(commandName, words.slice(1))) {
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
                words.slice(1),
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
        for (const word of words) {
          if (word === "\\" || word === "(" || word === ")" || word === "!")
            continue;
          if (word.startsWith("-") && word !== "-" && word !== "--") continue;
          pending.push(
            addCandidate(
              word,
              dir,
              false,
              undefined,
              [],
              false,
              expandedTokens.has(word),
            ),
          );
        }
      }
      return false;
    };

    const walkSequence = (stmts: Statement[]): void => {
      for (const stmt of flattenAndChains(stmts)) {
        const cmd = stmt.command;
        if (cmd.type === "Subshell" || cmd.type === "Block") {
          walkCommands(
            { ...ast, body: [{ ...stmt, command: { ...cmd, body: [] } }] },
            onCommand,
            { includeSubstitutions: true },
          );
          const outer = dir;
          walkSequence(cmd.body);
          if (cmd.type === "Subshell" || stmt.background) dir = outer;
          continue;
        }

        walkCommands({ ...ast, body: [stmt] }, onCommand, {
          includeSubstitutions: true,
        });

        const cd = cdWords(stmt);
        if (cd) {
          const next = nextCdDir(cd, dir, cwd, pathExists);
          if (next !== undefined) dir = next;
        }
      }
    };

    walkSequence(ast.body);

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
