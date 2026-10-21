import type { Word } from "@aliou/sh";
import { wordToString } from "../ast";
import type { Family } from "./family";
import { classifyPatternFirst, type OptionTable } from "./pattern-first";

const COMMANDS = new Set(["awk", "gawk", "mawk", "nawk"]);

const OPTIONS: OptionTable = {
  pattern: new Set<string>(),
  patternFile: new Set(["-f", "--file", "--source"]),
  path: new Set<string>(),
  data: new Set(["-F", "-v", "--field-separator", "--assign"]),
};

export const awkFamily: Family = {
  name: "awk",
  commands: COMMANDS,
  classify: (_cmd, args: Word[]) => {
    const roles = classifyPatternFirst(args, OPTIONS, "text-operand");
    for (let i = 0; i < args.length; i++) {
      if (
        roles[i] === "path" &&
        /^[A-Za-z_][A-Za-z0-9_]*=/.test(wordToString(args[i] as Word))
      ) {
        roles[i] = "option-value";
      }
    }
    return roles;
  },
};
