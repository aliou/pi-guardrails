import type { Word } from "@aliou/sh";
import { wordToString } from "../ast";
import type { Family } from "./family";
import { type ArgRole, isOptionText } from "./roles";

const PI_SUBCOMMANDS = new Set([
  "install",
  "remove",
  "uninstall",
  "update",
  "list",
  "config",
  "auth",
  "mcp",
]);

const PI_PATH_OPTIONS = new Set([
  "--session",
  "--fork",
  "--session-dir",
  "--extension",
  "-e",
  "--skill",
  "--prompt-template",
  "--theme",
  "--export",
  "--append-system-prompt",
]);

function messageRole(text: string): ArgRole {
  return text.startsWith("@") ? "operand" : "option-value";
}

export const agentCliFamily: Family = {
  name: "agent-cli",
  commands: new Set(["pi"]),
  classify(_cmd, args: Word[]) {
    const texts = args.map((w) => wordToString(w));
    if (PI_SUBCOMMANDS.has(texts[0] ?? "")) {
      return texts.map(() => "operand" as ArgRole);
    }
    const roles: ArgRole[] = new Array<ArgRole>(texts.length).fill("none");
    let parsingOptions = true;
    for (let i = 0; i < texts.length; i++) {
      const text = texts[i] as string;
      if (parsingOptions && text === "--") {
        parsingOptions = false;
        continue;
      }
      if (parsingOptions && isOptionText(text)) {
        if (PI_PATH_OPTIONS.has(text) && i + 1 < texts.length) {
          roles[++i] = "operand";
        }
        continue;
      }
      roles[i] = messageRole(text);
    }
    return roles;
  },
};
