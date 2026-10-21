import type { Word } from "@aliou/sh";
import { wordToString } from "../ast";
import type { Family } from "./family";
import { classifyPatternFirst, type OptionTable } from "./pattern-first";

const COMMANDS = new Set(["sed", "gsed", "ssed"]);

const OPTIONS: OptionTable = {
  pattern: new Set<string>(),
  patternFile: new Set(["-f", "--file"]),
  path: new Set<string>(),
  data: new Set(["-l", "--line-length"]),
};

export const sedFamily: Family = {
  name: "stream-editor",
  commands: COMMANDS,
  classify: (_cmd, args: Word[]) => {
    const roles = classifyPatternFirst(args, OPTIONS, "text-operand");
    // The program word (first operand or -e value) is opaque text: legacy
    // passed it through as a plain candidate, never token-extracted.
    for (let i = 0; i < args.length - 1; i++) {
      const text = wordToString(args[i] as Word);
      if (text === "-e" || text === "--expression")
        roles[i + 1] = "text-operand";
      if (text.startsWith("--expression=")) roles[i] = "text-operand";
    }
    return roles;
  },
};
