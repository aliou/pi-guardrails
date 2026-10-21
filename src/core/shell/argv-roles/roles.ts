import { basename } from "node:path";
import type { Word, WordPart } from "@aliou/sh";

export type ArgRole =
  | "path"
  | "pattern"
  | "program"
  | "program-shell"
  | "script"
  | "option-value"
  | "remote"
  | "text-operand"
  | "none"
  | "operand";

export type ClassifiedWord = {
  word: Word;
  text: string;
  role: ArgRole;
  /** Every literal character of this word was inside quotes. */
  quoted: boolean;
  hasExpansion: boolean;
};

export function wordIsFullyQuoted(word: Word): boolean {
  const parts = word.parts ?? [];
  if (parts.length === 0) return false;
  return parts.every((part: WordPart) => part.type !== "Literal");
}

export function normalizeCommandName(command: string): string {
  return basename(command).toLowerCase();
}

export function isOptionText(text: string): boolean {
  return text.startsWith("-") && text !== "-" && text !== "--";
}

export type ClassifiedArg = {
  token: string;
  forcePath?: boolean;
  programText?: boolean;
  recurseShell?: boolean;
};
