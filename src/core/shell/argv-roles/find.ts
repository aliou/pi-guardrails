import type { Word } from "@aliou/sh";
import { wordToString } from "../ast";
import type { Family } from "./family";
import type { ArgRole } from "./roles";

const COMMANDS = new Set(["find", "gfind"]);

const PATTERN_OPTIONS = new Set([
  "-name",
  "-iname",
  "-path",
  "-ipath",
  "-regex",
  "-iregex",
  "-wholename",
  "-iwholename",
]);

export const findFamily: Family = {
  name: "find",
  commands: COMMANDS,
  classify: (_cmd, args: Word[]) => {
    const roles: ArgRole[] = new Array<ArgRole>(args.length).fill("none");
    let inExpression = false;
    for (let i = 0; i < args.length; i++) {
      const text = wordToString(args[i] as Word);
      // `\(`-style operators arrive as lone `\` words; on Windows a stray
      // `\` would resolve to the drive root otherwise.
      if (text === "\\" || text === "(" || text === ")" || text === "!") {
        roles[i] = "none";
        inExpression = true;
        continue;
      }
      if (!inExpression && !text.startsWith("-")) {
        roles[i] = "path"; // search root
        continue;
      }
      inExpression = true;
      if (PATTERN_OPTIONS.has(text) && i + 1 < args.length) {
        roles[i] = "none";
        roles[++i] = "pattern";
        continue;
      }
      // No candidates from expression words — identical to legacy, which
      // pushes only pre-expression roots.
      roles[i] = "none";
    }
    return roles;
  },
};
