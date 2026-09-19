import { parse } from "@aliou/sh";
import { maybePathLike } from "../../src/core/paths";
import { hasShellExpansion } from "../../src/core/paths/plausibility";
import {
  isFdDuplicationRedirect,
  isHeredocRedirect,
  walkCommands,
  wordHasExpansion,
  wordToString,
} from "../../src/core/shell";
import { classifyCommandArgs } from "../../src/core/shell/command-args";
import { stripBashComments } from "../../src/core/shell/comments";
import { expandGlob, hasGlobChars } from "../../src/shared/glob";
import type { CompiledPolicy } from "./rules";
import { normalizeTarget } from "./rules";

/** A path extracted from a tool invocation, ready for policy matching. */
export interface ExtractedTarget {
  path: string;
  /**
   * Whether the path still contains an unexpanded shell expansion (e.g.
   * `$VAR`, `$(...)`). When true the real path is unknown, so the file can be
   * neither normalized away nor proven non-existent.
   */
  unresolved: boolean;
}

async function expandCandidate(candidate: string): Promise<string[]> {
  if (!hasGlobChars(candidate)) return [candidate];
  const matches = await expandGlob(candidate);
  return matches.length > 0 ? matches : [candidate];
}

/** Maximum nesting depth for recursive shell `-c` extraction. */
const MAX_EXTRACT_DEPTH = 3;

export async function extractTargets(
  event: { toolName: string; input: Record<string, unknown> },
  cwd: string,
  policies: CompiledPolicy[],
): Promise<ExtractedTarget[]> {
  if (
    ["read", "write", "edit", "grep", "find", "ls"].includes(event.toolName)
  ) {
    const target = String(
      event.input.file_path ?? event.input.path ?? "",
    ).trim();
    return target ? [{ path: target, unresolved: false }] : [];
  }

  if (event.toolName !== "bash") return [];
  return extractBashTargets(String(event.input.command ?? ""), cwd, policies);
}

async function extractBashTargets(
  command: string,
  cwd: string,
  policies: CompiledPolicy[],
  depth = 0,
): Promise<ExtractedTarget[]> {
  const targets = new Map<string, boolean>();

  const considerFile = async (file: string, unresolved: boolean) => {
    const normalized = normalizeTarget(file, cwd);
    if (
      policies.some((policy) =>
        policy.patterns.some((pattern) => pattern.test(normalized)),
      )
    ) {
      // If the same path surfaces both resolved and unresolved, treat it as
      // unresolved — the safe direction for a guardrail.
      targets.set(file, targets.get(file) || unresolved);
    }
  };

  const maybeAdd = async (candidate: string, unresolved: boolean) => {
    if (!candidate || candidate.startsWith("-")) return;
    for (const file of await expandCandidate(candidate)) {
      await considerFile(file, unresolved);
    }
  };

  try {
    const { ast } = parse(command);
    const pending: Promise<void>[] = [];
    walkCommands(ast, (cmd, redirects) => {
      if (cmd) {
        const words = (cmd.words ?? []).map(wordToString);
        // Argv words are classified the same way path-access classifies them
        // (interpreters, find, xargs, pattern-first search commands,
        // text-only commands, …), so a protected file name used as non-path
        // data — `printf '%s\n' '.env'` — is not treated as file access,
        // while real file operands still surface (issue #107).
        for (const arg of classifyCommandArgs(words[0] ?? "", words.slice(1))) {
          if (arg.recurseShell) {
            if (depth < MAX_EXTRACT_DEPTH) {
              pending.push(
                extractBashTargets(arg.token, cwd, policies, depth + 1).then(
                  async (nested) => {
                    for (const target of nested) {
                      await considerFile(target.path, target.unresolved);
                    }
                  },
                ),
              );
            }
          } else {
            // The classified token carries the word's raw text (including
            // expansions like `$VAR`), so string-level expansion detection
            // matches what wordHasExpansion would find.
            pending.push(
              maybeAdd(
                arg.token,
                !arg.forcePath && hasShellExpansion(arg.token),
              ),
            );
          }
        }
      }
      for (const redir of redirects ?? []) {
        // Fd duplications (`2>&1`) have no filesystem target, and heredoc
        // targets are delimiters, not paths.
        if (isFdDuplicationRedirect(redir) || isHeredocRedirect(redir))
          continue;
        pending.push(
          maybeAdd(wordToString(redir.target), wordHasExpansion(redir.target)),
        );
      }
      return false;
    });
    await Promise.all(pending);
  } catch {
    // Fallback: regex tokenization over comment-stripped text so comment
    // contents (which the parser rejects in some placements) cannot become
    // candidates. A guardrail must not add candidates in the safe direction:
    // keep every path-like token here, unfiltered.
    const stripped = stripBashComments(command);
    const tokenRegex = /"([^"]+)"|'([^']+)'|`([^`]+)`|([^\s"'`<>|;&]+)/g;
    for (const match of stripped.matchAll(tokenRegex)) {
      const token = match[1] ?? match[2] ?? match[3] ?? match[4] ?? "";
      if (token && !token.startsWith("-") && maybePathLike(token))
        await maybeAdd(token, false);
    }
  }

  return [...targets.entries()].map(([path, unresolved]) => ({
    path,
    unresolved,
  }));
}
