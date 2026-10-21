import type { SimpleCommand, Word } from "@aliou/sh";
import { parse } from "@aliou/sh";
import { walkCommands, wordToString } from "../ast";
import { classifyCommandArgs } from "../command-args";
import { toClassifiedArgs } from "./index";

export function firstCommand(source: string): SimpleCommand {
  const { ast } = parse(source);
  let found: SimpleCommand | undefined;
  walkCommands(ast, (cmd) => {
    if (cmd) {
      found = cmd;
      return true;
    }
    return false;
  });
  if (!found) throw new Error(`no simple command in ${source}`);
  return found;
}

export function wordsOf(source: string): { name: string; args: Word[] } {
  const cmd = firstCommand(source);
  const words = cmd.words ?? [];
  return { name: wordToString(words[0] as Word), args: words.slice(1) };
}

export function legacyCandidates(source: string): string[] {
  const { name, args } = wordsOf(source);
  return classifyCommandArgs(
    name,
    args.map((w) => wordToString(w)),
  ).map((c) => c.token);
}

export function roleCandidates(source: string): string[] {
  const { name, args } = wordsOf(source);
  return toClassifiedArgs(name, args).map((c) => c.token);
}
