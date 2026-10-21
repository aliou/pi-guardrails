import { homedir } from "node:os";
import { resolve } from "node:path";
import type { Program, SimpleCommand, Statement } from "@aliou/sh";
import { expandHomePath } from "../paths/path";
import { walkCommands, wordHasExpansion, wordToString } from "./ast";

/**
 * Map each simple command to the directory it runs in when a preceding `cd`
 * in the same `&&` chain changed it (issue #135). Commands not in the map run
 * in `cwd`.
 *
 * Only `cd DIR && …` is followed, because `&&` is the one operator that
 * guarantees the right side runs in DIR: with `;`, `||`, or `!` the next
 * command also runs when `cd` failed, still in the old directory, and
 * resolving it against DIR could place an outside path inside the
 * workspace. Subshells, pipelines, and anything else keep the old behaviour
 * of resolving against `cwd`.
 *
 * A `cd` whose destination cannot be known statically (`cd -`, `cd "$DIR"`,
 * a `CDPATH` lookup) ends tracking for the rest of the chain, which falls
 * back to `cwd` as before.
 */
export function trackCdChains(
  ast: Program,
  cwd: string,
  command: string,
): Map<SimpleCommand, string> {
  const dirs = new Map<SimpleCommand, string>();
  const cdpathMayApply =
    Boolean(process.env.CDPATH) || command.includes("CDPATH");

  for (const stmt of ast.body) {
    const links = flattenAndChain(stmt);
    if (!links) continue;

    let dir = cwd;
    for (const link of links) {
      if (dir !== cwd) {
        walkCommands(
          { type: "Program", body: [link] } as Program,
          (cmd) => {
            if (cmd && !dirs.has(cmd)) dirs.set(cmd, dir);
            return false;
          },
          { includeSubstitutions: true },
        );
      }
      const next = cdDestination(link, dir, cdpathMayApply);
      if (next === null) break;
      if (next !== undefined) dir = next;
    }
  }

  return dirs;
}

/** The links of a pure `a && b && c` chain, or undefined for anything else. */
function flattenAndChain(stmt: Statement): Statement[] | undefined {
  if (stmt.negated || stmt.command.type !== "Logical") return undefined;
  if (stmt.command.op !== "and") return undefined;
  const left = flattenAndChain(stmt.command.left) ?? [stmt.command.left];
  return [...left, stmt.command.right];
}

/**
 * Destination of a `cd` link: the new directory, `null` when it is a `cd`
 * whose destination is unknown, or `undefined` when the link is not a `cd`.
 */
function cdDestination(
  link: Statement,
  dir: string,
  cdpathMayApply: boolean,
): string | null | undefined {
  const cmd = link.command;
  if (cmd.type !== "SimpleCommand") return undefined;
  const words = cmd.words ?? [];
  const name = words[0];
  if (!name || wordHasExpansion(name)) return undefined;
  if (!["cd", "pushd"].includes(wordToString(name))) return undefined;
  if (link.negated || cmd.assignments?.length) return null;

  const operands: typeof words = [];
  let optionsDone = false;
  for (const word of words.slice(1)) {
    const text = wordToString(word);
    if (!optionsDone && text === "--") {
      optionsDone = true;
      continue;
    }
    if (!optionsDone && /^-[LPe@]+$/.test(text)) continue;
    operands.push(word);
  }

  if (operands.length === 0) return homedir();
  const [operand] = operands;
  if (operands.length > 1 || !operand || wordHasExpansion(operand)) return null;
  const target = wordToString(operand);
  // `-`/`+N` name the directory stack, `~user` another user's home.
  if (/^[-+]/.test(target) || /^~[^/\\]/.test(target)) return null;
  // `cd name` consults CDPATH before the current directory, so only explicit
  // anchors are safe to resolve when CDPATH may be set.
  if (cdpathMayApply && !/^(\/|~|\.\.?(\/|$))/.test(target)) return null;
  return resolve(dir, expandHomePath(target));
}
