import { parse } from "@aliou/sh";
import { maybePathLike } from "../../src/core/paths";
import {
  walkCommands,
  wordHasExpansion,
  wordToString,
} from "../../src/core/shell";
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
  const command = String(event.input.command ?? "");
  const targets = new Map<string, boolean>();
  const maybeAdd = async (candidate: string, unresolved: boolean) => {
    if (!candidate || candidate.startsWith("-")) return;
    for (const file of await expandCandidate(candidate)) {
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
    }
  };

  try {
    const { ast } = parse(command);
    const pending: Promise<void>[] = [];
    walkCommands(ast, (cmd) => {
      for (const word of (cmd.words ?? []).slice(1)) {
        pending.push(maybeAdd(wordToString(word), wordHasExpansion(word)));
      }
      for (const redir of cmd.redirects ?? []) {
        pending.push(
          maybeAdd(wordToString(redir.target), wordHasExpansion(redir.target)),
        );
      }
      return false;
    });
    await Promise.all(pending);
  } catch {
    const tokenRegex = /"([^"]+)"|'([^']+)'|`([^`]+)`|([^\s"'`<>|;&]+)/g;
    for (const match of command.matchAll(tokenRegex)) {
      const token = match[1] ?? match[2] ?? match[3] ?? match[4] ?? "";
      if (maybePathLike(token)) await maybeAdd(token, false);
    }
  }

  return [...targets.entries()].map(([path, unresolved]) => ({
    path,
    unresolved,
  }));
}
