import type { Word } from "@aliou/sh";
import type { Family } from "./family";
import { classifyPatternFirst, type OptionTable } from "./pattern-first";

const COMMANDS = new Set([
  "grep",
  "egrep",
  "fgrep",
  "rgrep",
  "ugrep",
  "rg",
  "ag",
  "ack",
]);

const OPTIONS: OptionTable = {
  pattern: new Set(["-e", "--regexp"]),
  patternFile: new Set(["-f", "--file"]),
  path: new Set(["--exclude-from", "--ignore-file"]),
  data: new Set([
    "-A",
    "-B",
    "-C",
    "-m",
    "-d",
    "-D",
    "--after-context",
    "--before-context",
    "--context",
    "--max-count",
    "--directories",
    "--devices",
    "--label",
    "--binary-files",
    "--exclude",
    "--include",
    "--exclude-dir",
    "-g",
    "--glob",
    "--iglob",
    "-t",
    "-T",
    "--type",
    "--type-not",
    "-j",
    "--threads",
    "--max-depth",
    "--sort",
    "--colors",
    "--encoding",
    "-M",
    "--max-columns",
  ]),
};

export const searchFamily: Family = {
  name: "search",
  commands: COMMANDS,
  classify: (_cmd, args: Word[]) =>
    classifyPatternFirst(args, OPTIONS, "pattern"),
};
