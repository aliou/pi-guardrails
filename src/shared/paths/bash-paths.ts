import { resolve } from "node:path";
import { parse } from "@aliou/sh";
import { expandHomePath, maybePathLike } from "../../core/paths/path";
import { walkCommands, wordToString } from "../../core/shell/ast";
import { classifyCommandArgs } from "../../core/shell/command-args";
import type { IgnoredBashArgRule } from "../config/types";
import { expandGlob, hasGlobChars } from "../glob";

function basenameOfCommand(command: string): string {
  const value = String(command);
  return value.split(/[\\/]/).pop()?.toLowerCase() ?? value.toLowerCase();
}

function matchesArgPattern(rule: IgnoredBashArgRule, token: string): boolean {
  if (rule.regex) {
    try {
      return new RegExp(rule.argPattern).test(token);
    } catch {
      return false;
    }
  }

  return token.includes(rule.argPattern);
}

function shouldIgnoreBashArg(
  command: string,
  args: string[],
  token: string,
  ignoredArgs: IgnoredBashArgRule[],
): boolean {
  const commandName = basenameOfCommand(command);
  return ignoredArgs.some((rule) => {
    if (basenameOfCommand(rule.command) !== commandName) return false;
    if (rule.subcommands) {
      for (let i = 0; i < rule.subcommands.length; i++) {
        if (args[i] !== rule.subcommands[i]) return false;
      }
    }
    return matchesArgPattern(rule, token);
  });
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
  ignoredArgs: IgnoredBashArgRule[] = [],
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
      const commandName = words[0];
      const args = words.slice(1);
      if (commandName) {
        for (const arg of classifyCommandArgs(commandName, args)) {
          if (shouldIgnoreBashArg(commandName, args, arg.token, ignoredArgs)) {
            continue;
          }
          pending.push(addCandidate(arg.token, arg.forcePath));
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
    // Fallback: regex tokenization. Configured ignored bash args require
    // parsed command argv context, so fallback stays conservative.
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
