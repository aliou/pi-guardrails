import type { Word } from "@aliou/sh";
import { wordToString } from "../ast";
import type { Family } from "./family";
import type { ArgRole } from "./roles";

const NO_FILE_OPERAND_COMMANDS = new Set(["echo", "printf", "tr"]);

export const noFileOperandFamily: Family = {
  name: "no-file-operand",
  commands: NO_FILE_OPERAND_COMMANDS,
  classify: (_cmd, args: Word[]) => args.map(() => "none" as ArgRole),
};

const DELIMITER_OPTIONS: Record<string, ReadonlySet<string>> = {
  cut: new Set(["-d", "--delimiter"]),
  sort: new Set(["-t", "--field-separator"]),
};

export const delimiterValueFamily: Family = {
  name: "delimiter-value",
  commands: new Set(Object.keys(DELIMITER_OPTIONS)),
  classify(cmd, args: Word[]) {
    const withValues = DELIMITER_OPTIONS[cmd] ?? new Set<string>();
    const roles: ArgRole[] = new Array<ArgRole>(args.length).fill("operand");
    for (let i = 0; i < args.length; i++) {
      const text = wordToString(args[i] as Word);
      if (withValues.has(text)) {
        roles[i] = "none";
        if (i + 1 < args.length) roles[++i] = "option-value";
      }
    }
    return roles;
  },
};
