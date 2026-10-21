import type { Word } from "@aliou/sh";
import { wordToString } from "../ast";
import type { Family } from "./family";
import type { ArgRole } from "./roles";

const COMMANDS = new Set(["ssh", "kubectl"]);

export const remoteFamily: Family = {
  name: "remote",
  commands: COMMANDS,
  classify(cmd, args: Word[]) {
    // everything past the ssh binary runs remotely
    if (cmd === "ssh") return args.map(() => "remote" as ArgRole);

    // argv after `--` belongs to the pod's command
    const texts = args.map((w) => wordToString(w));
    const tail = texts.indexOf("--");
    return texts.map((_, i) =>
      tail === -1 || i < tail
        ? ("operand" as ArgRole)
        : i === tail
          ? ("none" as ArgRole)
          : ("remote" as ArgRole),
    );
  },
};
