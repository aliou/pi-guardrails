import { parse } from "@aliou/sh";
import { maybePathLike } from "../../src/core/paths";
import { walkCommands, wordToString } from "../../src/core/shell";
import { expandGlob, hasGlobChars } from "../../src/shared/glob";
import type { CompiledPolicy } from "./rules";
import { normalizeTarget } from "./rules";

async function expandCandidate(candidate: string): Promise<string[]> {
  if (!hasGlobChars(candidate)) return [candidate];
  const matches = await expandGlob(candidate);
  return matches.length > 0 ? matches : [candidate];
}

export async function extractTargets(
  event: { toolName: string; input: Record<string, unknown> },
  cwd: string,
  policies: CompiledPolicy[],
): Promise<string[]> {
  if (
    ["read", "write", "edit", "grep", "find", "ls"].includes(event.toolName)
  ) {
    const target = String(
      event.input.file_path ?? event.input.path ?? "",
    ).trim();
    return target ? [target] : [];
  }

  if (event.toolName !== "bash") return [];
  const command = String(event.input.command ?? "");
  const targets = new Set<string>();
  const maybeAdd = async (candidate: string) => {
    if (!candidate || candidate.startsWith("-")) return;
    for (const file of await expandCandidate(candidate)) {
      const normalized = normalizeTarget(file, cwd);
      if (
        policies.some((policy) =>
          policy.patterns.some((pattern) => pattern.test(normalized)),
        )
      ) {
        targets.add(file);
      }
    }
  };

  try {
    const { ast } = parse(command);
    const pending: Promise<void>[] = [];
    walkCommands(ast, (cmd) => {
      const words = (cmd.words ?? []).map(wordToString);
      for (const word of words.slice(1)) pending.push(maybeAdd(word));
      for (const redir of cmd.redirects ?? []) {
        pending.push(maybeAdd(wordToString(redir.target)));
      }
      return false;
    });
    await Promise.all(pending);
  } catch {
    const tokenRegex = /"([^"]+)"|'([^']+)'|`([^`]+)`|([^\s"'`<>|;&]+)/g;
    for (const match of command.matchAll(tokenRegex)) {
      const token = match[1] ?? match[2] ?? match[3] ?? match[4] ?? "";
      if (maybePathLike(token)) await maybeAdd(token);
    }
  }

  return [...targets];
}
