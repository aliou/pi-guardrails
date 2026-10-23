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
const CODE_TOKEN_REGEX =
  /"([^"]+)"|'([^']+)'|`([^`]+)`|([^\s"'`<>|;&(){}[\]]+)/g;

export function extractProgramTextPaths(code: string): string[] {
  const out: string[] = [];
  for (const match of code.matchAll(CODE_TOKEN_REGEX)) {
    const token = match[1] ?? match[2] ?? match[3] ?? match[4] ?? "";
    if (!token || token.startsWith("-")) continue;
    if (!maybePathLike(token)) continue;
    out.push(token);
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
