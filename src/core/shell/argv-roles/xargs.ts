import type { Word } from "@aliou/sh";
import { wordToString } from "../ast";
import type { Family } from "./family";
import { type ArgRole, isOptionText } from "./roles";

const OPTIONS_WITH_VALUES = new Set([
  "-I",
  "-J",
  "-L",
  "-n",
  "-P",
  "-s",
  "-S",
  "-E",
]);

export const xargsFamily: Family = {
  name: "nested-command",
  commands: new Set(["xargs"]),
  classify(_cmd, args, reclassify) {
    for (let i = 0; i < args.length; i++) {
      const text = wordToString(args[i] as Word);
      if (OPTIONS_WITH_VALUES.has(text)) {
        i++;
        continue;
      }
      if (isOptionText(text)) continue;
      const head: ArgRole[] = new Array<ArgRole>(i + 1).fill("none");
      return [...head, ...reclassify(text, args.slice(i + 1))];
    }
    return args.map(() => "none" as ArgRole);
  },
};
