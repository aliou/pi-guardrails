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

const PROGRAM_LITERAL_REGEX = /"([^"]*)"|'([^']*)'|`([^`]*)`/g;
const CONCAT_GAP_REGEX = /^\s*\+\s*$/;
const SUBSCRIPT_TARGET_REGEX = /[\w$)\]]/;

interface ProgramLiteral {
  value: string;
  start: number;
  end: number;
}

function programLiterals(code: string): ProgramLiteral[] {
  return Array.from(code.matchAll(PROGRAM_LITERAL_REGEX), (match) => {
    const start = match.index ?? 0;
    return {
      value: match[1] ?? match[2] ?? match[3] ?? "",
      start,
      end: start + match[0].length,
    };
  });
}

function concatenationChains(
  code: string,
  literals: ProgramLiteral[],
): ProgramLiteral[][] {
  const chains: ProgramLiteral[][] = [];
  let previous: ProgramLiteral | undefined;
  for (const literal of literals) {
    const gap = previous ? code.slice(previous.end, literal.start) : "";
    const chain = chains.at(-1);
    if (chain && CONCAT_GAP_REGEX.test(gap)) chain.push(literal);
    else chains.push([literal]);
    previous = literal;
  }
  return chains;
}

function previousNonSpace(code: string, from: number): number {
  let i = from;
  while (i >= 0 && /\s/.test(code[i])) i--;
  return i;
}

function nextNonSpace(code: string, from: number): number {
  let i = from;
  while (i < code.length && /\s/.test(code[i])) i++;
  return i;
}

function isSubscriptKey(code: string, start: number): boolean {
  const bracket = previousNonSpace(code, start - 1);
  if (code[bracket] !== "[") return false;
  return SUBSCRIPT_TARGET_REGEX.test(code[bracket - 1] ?? "");
}

function chainValue(code: string, chain: ProgramLiteral[]): string {
  const first = chain[0];
  const last = chain[chain.length - 1];
  if (code[previousNonSpace(code, first.start - 1)] === "+") return "";
  if (code[nextNonSpace(code, last.end)] === "+") return "";
  if (isSubscriptKey(code, first.start)) return "";
  return chain.map((literal) => literal.value).join("");
}

export function extractProgramTextPaths(code: string): string[] {
  const out: string[] = [];
  for (const chain of concatenationChains(code, programLiterals(code))) {
    const value = chainValue(code, chain);
    if (!value || value.startsWith("-")) continue;
    if (!maybePathLike(value)) continue;
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
