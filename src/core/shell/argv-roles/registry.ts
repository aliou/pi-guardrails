import type { Word } from "@aliou/sh";
import { awkFamily } from "./awk";
import type { Family, FamilyName } from "./family";
import { findFamily } from "./find";
import { interpreterFamily } from "./interpreter";
import { remoteFamily } from "./remote";
import { type ArgRole, normalizeCommandName } from "./roles";
import { searchFamily } from "./search";
import { sedFamily } from "./sed";
import { delimiterValueFamily, noFileOperandFamily } from "./text";
import { xargsFamily } from "./xargs";

const FAMILIES: Family[] = [
  searchFamily,
  sedFamily,
  awkFamily,
  findFamily,
  interpreterFamily,
  remoteFamily,
  noFileOperandFamily,
  delimiterValueFamily,
  xargsFamily,
];

export function commandFamily(command: string): FamilyName {
  const cmd = normalizeCommandName(command);
  for (const family of FAMILIES) {
    if (family.commands.has(cmd)) return family.name;
  }
  return "generic";
}

export function takesNoFileOperands(command: string): boolean {
  return commandFamily(command) === "no-file-operand";
}

function classifyRoles(cmd: string, args: Word[]): ArgRole[] {
  const name = normalizeCommandName(cmd);
  for (const family of FAMILIES) {
    if (family.commands.has(name)) {
      return family.classify(name, args, classifyRoles);
    }
  }

  // exact legacy fallback: flags stay candidates, downstream filters decide
  return args.map(() => "operand" as ArgRole);
}

export { classifyRoles };
