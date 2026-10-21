import type { Word } from "@aliou/sh";
import { wordToString } from "../ast";
import { type ArgRole, isOptionText } from "./roles";

type OptionKind = "flag" | "pattern" | "patternfile" | "path" | "data";

type FirstPositionalRole = "pattern" | "program" | "text-operand";

export type OptionTable = {
  pattern: ReadonlySet<string>;
  patternFile: ReadonlySet<string>;
  path: ReadonlySet<string>;
  data: ReadonlySet<string>;
  attachedOnly?: ReadonlySet<string>;
};

type OptionValue = { kind: OptionKind; attached: boolean };

function optionKind(table: OptionTable, opt: string): OptionKind {
  if (table.pattern.has(opt)) return "pattern";
  if (table.patternFile.has(opt)) return "patternfile";
  if (table.path.has(opt)) return "path";
  if (table.data.has(opt)) return "data";
  return "flag";
}

function longOptionValue(table: OptionTable, text: string): OptionValue {
  const eq = text.indexOf("=");
  if (eq === -1) return { kind: optionKind(table, text), attached: false };
  return { kind: optionKind(table, text.slice(0, eq)), attached: true };
}

function shortOptionValue(table: OptionTable, text: string): OptionValue {
  for (let j = 1; j < text.length; j++) {
    const opt = `-${text[j]}`;
    if (table.attachedOnly?.has(opt)) break;
    const kind = optionKind(table, opt);
    if (kind !== "flag") return { kind, attached: j < text.length - 1 };
  }
  return { kind: "flag", attached: false };
}

function optionValue(table: OptionTable, text: string): OptionValue {
  return text.startsWith("--")
    ? longOptionValue(table, text)
    : shortOptionValue(table, text);
}

function roleForKind(
  kind: OptionKind,
  firstPositional: FirstPositionalRole,
): ArgRole {
  switch (kind) {
    case "pattern":
      return firstPositional;
    case "patternfile":
    case "path":
      return "path";
    case "data":
      return "option-value";
    default:
      return "operand";
  }
}

function suppliesPattern(kind: OptionKind): boolean {
  return kind === "pattern" || kind === "patternfile";
}

export function classifyPatternFirst(
  args: Word[],
  table: OptionTable,
  firstPositional: FirstPositionalRole,
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

    if (!afterDoubleDash && isOptionText(text)) {
      const { kind, attached } = optionValue(table, text);
      if (suppliesPattern(kind)) sawFirstPositional = true;
      if (attached) {
        roles[i] = roleForKind(kind, firstPositional);
        continue;
      }
      roles[i] = "none";
      if (kind !== "flag" && i + 1 < args.length) {
        roles[++i] = roleForKind(kind, firstPositional);
      }
      continue;
    }

    if (text === "-") {
      roles[i] = "none";
      continue;
    }

    roles[i] = sawFirstPositional ? "path" : firstPositional;
    sawFirstPositional = true;
  }

  return roles;
}
