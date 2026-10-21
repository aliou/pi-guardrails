import { existsSync } from "node:fs";
import { parse as parsePath, resolve } from "node:path";
import { parse, type Word } from "@aliou/sh";
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

const MAX_SHELL_DEPTH = 3;

export type ExtractOptions = {
  depth?: number;
  pathExists?: (path: string) => boolean;
};

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

    const skipImplausible =
      forcePath ||
      mayExpand ||
      commandCreatesPaths(commandName, commandArgs) ||
      programText;

    const expanded = await expandCandidate(token, dir);
    for (const file of expanded) {
      const abs = resolve(dir, expandHomePath(file));
      if (parsePath(abs).root === abs) continue;
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
        const dir = dirFor(scope);
        const wordList = cmd?.words ?? [];
        const expandedTokens = new Set<string>();
        for (const word of wordList) {
          if (wordHasExpansion(word)) expandedTokens.add(wordToString(word));
        }
        for (const redir of redirects ?? []) {
          if (isFdDuplicationRedirect(redir)) continue;
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
        if (commandName === "cd") {
          const next = nextCdDir(wordList.slice(1), dir, cwd, pathExists);
          if (next !== undefined) scopeDirs.set(scope, next);
        }
        return false;
      },
      { includeSubstitutions: true },
    );

    await Promise.all(pending);
    return results;
  } catch {
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
