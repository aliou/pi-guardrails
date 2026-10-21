import type { Word } from "@aliou/sh";
import { maybePathLike } from "../../paths/path";
import { wordHasExpansion, wordToString } from "../ast";
import { classifyRoles, commandFamily, takesNoFileOperands } from "./registry";
import {
  type ClassifiedArg,
  type ClassifiedWord,
  normalizeCommandName,
  wordIsFullyQuoted,
} from "./roles";

export type { ClassifiedArg };
export { commandFamily, takesNoFileOperands };

export function classifyInvocation(
  command: string,
  args: Word[],
): ClassifiedWord[] {
  const roles = classifyRoles(normalizeCommandName(command), args);
  return args.map((word, i) => ({
    word,
    text: wordToString(word),
    role: roles[i] ?? "operand",
    quoted: wordIsFullyQuoted(word),
    hasExpansion: wordHasExpansion(word),
  }));
}

// mirrors legacy extractPathsFromCode exactly; the #136 refinement is deferred
const PROGRAM_LITERAL_REGEX = /"([^"]*)"|'([^']*)'|`([^`]*)`/g;

function adjacentOperatorChar(
  code: string,
  from: number,
  step: 1 | -1,
): string {
  for (let i = from; i >= 0 && i < code.length; i += step) {
    if (!/\s/.test(code[i])) return code[i];
  }
  return "";
}

/**
 * Path candidates from interpreter code (`node -e`, `python -c`, …). Only
 * quoted string literals count: bare code tokens like the `/1.055` of a
 * division are identifiers and operators, not paths. A literal glued to a
 * `+` is a concatenation fragment (`p + "/package.json"`) whose target is
 * unknowable, and a literal against `[`/`]` is a dictionary key or index
 * (`spec["paths"]["/api/items"]`), so both are skipped. Literals in call
 * position (`open("/etc/passwd")`) are kept.
 */
export function extractProgramTextPaths(code: string): string[] {
  const out: string[] = [];
  for (const match of code.matchAll(PROGRAM_LITERAL_REGEX)) {
    const value = match[1] ?? match[2] ?? match[3] ?? "";
    if (!value || value.startsWith("-")) continue;
    if (!maybePathLike(value)) continue;
    const start = match.index ?? 0;
    const before = adjacentOperatorChar(code, start - 1, -1);
    const after = adjacentOperatorChar(code, start + match[0].length, 1);
    if (before === "+" || after === "+") continue;
    if (before === "[" || after === "]") continue;
    out.push(value);
  }
  return out;
}

export function toClassifiedArgs(
  command: string,
  args: Word[],
): ClassifiedArg[] {
  const out: ClassifiedArg[] = [];
  for (const cw of classifyInvocation(command, args)) {
    switch (cw.role) {
      case "path":
      case "operand":
      case "text-operand":
        out.push({ token: cw.text });
        break;
      case "script":
        out.push({ token: cw.text, forcePath: true });
        break;
      case "program-shell":
        out.push({ token: cw.text, recurseShell: true });
        break;
      case "program":
        for (const token of extractProgramTextPaths(cw.text)) {
          out.push({ token, programText: true });
        }
        break;
      default:
        break;
    }
  }
  return out;
}
