import type { Word } from "@aliou/sh";
import type { Family } from "./family";
import { classifyPatternFirst, type OptionTable } from "./pattern-first";

const COMMANDS = new Set(["sed", "gsed", "ssed"]);

const OPTIONS: OptionTable = {
  pattern: new Set(["-e", "--expression"]),
  patternFile: new Set(["-f", "--file"]),
  path: new Set<string>(),
  data: new Set(["-l", "--line-length"]),
  attachedOnly: new Set(["-i"]),
};

export const sedFamily: Family = {
  name: "stream-editor",
  commands: COMMANDS,
  classify: (_cmd, args: Word[]) =>
    classifyPatternFirst(args, OPTIONS, "text-operand"),
};
