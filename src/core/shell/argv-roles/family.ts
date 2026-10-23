import type { Word } from "@aliou/sh";
import type { ArgRole } from "./roles";

export type FamilyName =
  | "search"
  | "stream-editor"
  | "awk"
  | "find"
  | "interpreter"
  | "remote"
  | "no-file-operand"
  | "delimiter-value"
  | "nested-command"
  | "generic";

export type Reclassify = (cmd: string, args: Word[]) => ArgRole[];

export interface Family {
  name: FamilyName;
  commands: ReadonlySet<string>;
  classify(cmd: string, args: Word[], reclassify: Reclassify): ArgRole[];
}
