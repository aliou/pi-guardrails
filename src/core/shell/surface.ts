import { parse } from "@aliou/sh";
import { classifyInvocation } from "./argv-roles";
import type { ArgRole } from "./argv-roles/roles";
import { walkCommands, wordToString } from "./ast";

const DATA_ROLES: ReadonlySet<ArgRole> = new Set([
  "pattern",
  "text-operand",
  "remote",
  "option-value",
]);

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
