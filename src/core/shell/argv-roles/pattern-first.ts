import type { Word } from "@aliou/sh";
import { wordToString } from "../ast";
import { type ArgRole, isOptionText } from "./roles";

type OptionKind = "flag" | "pattern" | "patternfile" | "path" | "data";

export type OptionTable = {
  pattern: ReadonlySet<string>;
  /** Pattern files (`grep -f`): real paths that also supply the pattern. */
  patternFile: ReadonlySet<string>;
  path: ReadonlySet<string>;
  data: ReadonlySet<string>;
};

function optionKind(table: OptionTable, opt: string): OptionKind {
  if (table.pattern.has(opt)) return "pattern";
  if (table.patternFile.has(opt)) return "patternfile";
  if (table.path.has(opt)) return "path";
  if (table.data.has(opt)) return "data";
  // Unknown options consume nothing: a miss errs toward an extra candidate,
  // never toward a pattern reading as a path (#134).
  return "flag";
}

function roleForKind(kind: OptionKind): ArgRole {
  switch (kind) {
    case "pattern":
      return "pattern";
    case "patternfile":
    case "path":
      return "path";
    default:
      return "option-value";
  }
}

function suppliesPattern(kind: OptionKind): boolean {
  return kind === "pattern" || kind === "patternfile";
}

// `[options] PATTERN|PROGRAM [FILE]…` with GNU option permutation. Grouped
// short options whose last letter takes a value (`grep -ne foo`) are not
// unpacked; the pattern shifts one position (documented, fail-safe gap).
export function classifyPatternFirst(
  args: Word[],
  table: OptionTable,
  firstPositional: "pattern" | "program" | "text-operand",
): ArgRole[] {
  const roles: ArgRole[] = new Array<ArgRole>(args.length).fill("operand");
  let sawFirstPositional = false;
  let afterDoubleDash = false;

  for (let i = 0; i < args.length; i++) {
    const text = wordToString(args[i] as Word);

    if (!afterDoubleDash && text === "--") {
      roles[i] = "none";
      afterDoubleDash = true;
      continue;
    }

    if (!afterDoubleDash && text.startsWith("--")) {
      const eq = text.indexOf("=");
      if (eq !== -1) {
        const kind = optionKind(table, text.slice(0, eq));
        roles[i] = kind === "flag" ? "operand" : roleForKind(kind);
        if (suppliesPattern(kind)) sawFirstPositional = true;
        continue;
      }
      const kind = optionKind(table, text);
      roles[i] = "none";
      if (kind !== "flag" && i + 1 < args.length) {
        roles[++i] = roleForKind(kind);
        if (suppliesPattern(kind)) sawFirstPositional = true;
      }
      continue;
    }

    if (!afterDoubleDash && isOptionText(text)) {
      const kind = optionKind(table, text);
      roles[i] = "none";
      if (kind !== "flag" && i + 1 < args.length) {
        roles[++i] = roleForKind(kind);
        if (suppliesPattern(kind)) sawFirstPositional = true;
      }
      continue;
    }

    if (text === "-") {
      roles[i] = "none"; // stdin marker
      continue;
    }

    if (!sawFirstPositional) {
      roles[i] = firstPositional;
      sawFirstPositional = true;
    } else {
      roles[i] = "path";
    }
  }

  return roles;
}
