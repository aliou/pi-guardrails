import type { Word } from "@aliou/sh";
import { wordToString } from "../ast";
import type { Family } from "./family";
import { type ArgRole, isOptionText } from "./roles";

const SHELL_INTERPRETERS = new Set([
  "bash",
  "sh",
  "zsh",
  "dash",
  "ksh",
  "mksh",
  "ash",
]);

const CODE_INTERPRETERS = new Set([
  "python",
  "python2",
  "python3",
  "node",
  "ruby",
  "perl",
  "php",
  "powershell",
  "pwsh",
  "lua",
  "lua5.1",
  "lua5.2",
  "lua5.3",
  "lua5.4",
  "rscript",
  "oscript",
  "osascript",
]);

type InterpreterSpec = {
  codeFlags: ReadonlySet<string>;
  fileFlags: ReadonlySet<string>;
  skipFlags: ReadonlySet<string>;
  shellFamily: boolean;
  caseInsensitive: boolean;
};

function interpreterSpec(cmd: string): InterpreterSpec {
  if (cmd === "powershell" || cmd === "pwsh") {
    // case-insensitive; -c/-ca, -f/-fi, -e/-ec aliases
    return {
      codeFlags: new Set(["-command", "-c", "-ca"]),
      fileFlags: new Set(["-file", "-f", "-fi"]),
      skipFlags: new Set(["-encodedcommand", "-e", "-ec"]),
      shellFamily: false,
      caseInsensitive: true,
    };
  }
  if (SHELL_INTERPRETERS.has(cmd)) {
    return {
      codeFlags: new Set(["-c"]),
      fileFlags: new Set(),
      skipFlags: new Set(),
      shellFamily: true,
      caseInsensitive: false,
    };
  }
  const codeFlags =
    cmd === "python" || cmd.startsWith("python")
      ? new Set(["-c"])
      : cmd === "php"
        ? new Set(["-r"])
        : new Set(["-e"]);
  return {
    codeFlags,
    fileFlags: new Set(),
    skipFlags: new Set(),
    shellFamily: false,
    caseInsensitive: false,
  };
}

export const interpreterFamily: Family = {
  name: "interpreter",
  commands: new Set([...SHELL_INTERPRETERS, ...CODE_INTERPRETERS]),
  classify(cmd, args: Word[]) {
    const { codeFlags, fileFlags, skipFlags, shellFamily, caseInsensitive } =
      interpreterSpec(cmd);
    const roles: ArgRole[] = new Array<ArgRole>(args.length).fill("operand");
    for (let i = 0; i < args.length; i++) {
      const raw = wordToString(args[i] as Word);
      const flag = caseInsensitive ? raw.toLowerCase() : raw;
      if (codeFlags.has(flag)) {
        roles[i] = "none";
        if (i + 1 < args.length) {
          roles[++i] = shellFamily ? "program-shell" : "program";
        }
        continue;
      }
      if (fileFlags.has(flag)) {
        roles[i] = "none";
        if (i + 1 < args.length) roles[++i] = "script";
        continue;
      }
      if (skipFlags.has(flag)) {
        roles[i] = "none";
        if (i + 1 < args.length) roles[++i] = "option-value";
        continue;
      }
      if (isOptionText(raw)) {
        roles[i] = "none";
        continue;
      }
      roles[i] = "path"; // the script file
    }
    return roles;
  },
};
