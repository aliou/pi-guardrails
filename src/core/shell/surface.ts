import { parse } from "@aliou/sh";
import { classifyInvocation } from "./argv-roles";
import type { ArgRole } from "./argv-roles/roles";
import { walkCommands, wordToString } from "./ast";

/**
 * Roles whose word is data for the command's own grammar, never a local
 * filesystem operand. Quoted data words are what make raw-string pattern
 * matching false-positive: `grep -c 'a * 2 / 3' f.js` contains " / " that
 * is division inside a pattern, not a root path.
 */
const DATA_ROLES: ReadonlySet<ArgRole> = new Set([
  "pattern",
  "text-operand",
  "remote",
  "option-value",
]);

/**
 * The command surface: per simple command, the command text minus fully
 * quoted data words. Interpreter code (`node -e`) is kept: deny patterns
 * legitimately inspect code content. Flags and shell punctuation are kept
 * so patterns like `rm -rf` or `find -delete` still match.
 *
 * Returns one surface per simple command (substitutions included), or null
 * when the command does not parse — callers then fall back to the raw
 * string.
 */
export function commandSurfaces(command: string): string[] | null {
  let ast: ReturnType<typeof parse>["ast"];
  try {
    ({ ast } = parse(command));
  } catch {
    return null;
  }

  const surfaces: string[] = [];
  walkCommands(
    ast,
    (cmd) => {
      if (!cmd) return false;
      const words = cmd.words ?? [];
      const name = words[0] ? wordToString(words[0]) : "";
      if (!name) return false;
      const out = [name];
      for (const cw of classifyInvocation(name, words.slice(1))) {
        if (DATA_ROLES.has(cw.role) && cw.quoted) continue;
        out.push(cw.text);
      }
      surfaces.push(out.join(" "));
      return false;
    },
    { includeSubstitutions: true },
  );
  return surfaces;
}
