/**
 * Shared shell AST helpers used by guardrails hooks.
 *
 * Each hook imports `parse` from `@aliou/sh` directly and uses these
 * for common AST operations.
 */

import type {
  Command,
  Program,
  SimpleCommand,
  Statement,
  Word,
  WordPart,
} from "@aliou/sh";

/**
 * Resolve a Word node to its literal string value.
 * Concatenates Literal, SglQuoted, and simple DblQuoted parts.
 * For parts containing parameter expansions, command substitutions, etc.,
 * includes the raw text representation (e.g. `$VAR`).
 */
export function wordToString(word: Word): string {
  return word.parts.map(partToString).join("");
}

function partToString(part: WordPart): string {
  switch (part.type) {
    case "Literal":
      return part.value;
    case "SglQuoted":
      return part.value;
    case "DblQuoted":
      return part.parts.map(partToString).join("");
    case "ParamExp": {
      if (part.short) return `$${part.param.value}`;
      const inner = `${part.excl ? "!" : ""}${part.length ? "#" : ""}${part.param.value}${part.exp ? `${part.exp.op}${part.exp.word ? wordToString(part.exp.word) : ""}` : ""}`;
      return `\${${inner}}`;
    }
    case "CmdSubst":
      return "$(...)";
    case "ArithExp":
      return "$((...))";
    case "ProcSubst":
      return `${part.op}(...)`;
    case "BraceExp":
      return part.elems.map(wordToString).join(",");
    case "ExtGlob":
      return `${part.op}${part.pattern})`;
  }
}

/**
 * Whether a word contains any shell expansion (parameter, command
 * substitution, arithmetic, or process substitution) that can't be resolved
 * statically.
 *
 * Such words can't be reliably stat()'d — we don't know what the variable or
 * substitution resolves to — so existence-based decisions must not use them to
 * prove a file *doesn't* exist. This mirrors ShellCheck's stance that
 * indirection is "known to be unsolvable in the most general case": rather than
 * attempt to expand, treat unresolvable references conservatively.
 */
export function wordHasExpansion(word: Word): boolean {
  return (word.parts ?? []).some(partHasExpansion);
}

function partHasExpansion(part: WordPart): boolean {
  switch (part.type) {
    case "Literal":
    case "SglQuoted":
      return false;
    case "DblQuoted":
      return (part.parts ?? []).some(partHasExpansion);
    // ParamExp, CmdSubst, ArithExp, ProcSubst, BraceExp, ExtGlob, and any
    // part type a future @aliou/sh adds. Defaulting to `true` keeps the
    // conservative stance when the AST grows: an unrecognised part is
    // treated as unresolvable rather than silently proving a file absent.
    default:
      return true;
  }
}

/**
 * Walk the AST and call `callback` for every SimpleCommand found at any
 * nesting depth. Returns early if callback returns `true`.
 */
export function walkCommands(
  node: Program,
  callback: (cmd: SimpleCommand) => boolean | undefined,
): void {
  for (const stmt of node.body) {
    if (walkStatement(stmt, callback)) return;
  }
}

function walkStatement(
  stmt: Statement,
  callback: (cmd: SimpleCommand) => boolean | undefined,
): boolean {
  return walkCommand(stmt.command, callback);
}

function walkStatements(
  stmts: Statement[],
  callback: (cmd: SimpleCommand) => boolean | undefined,
): boolean {
  for (const stmt of stmts) {
    if (walkStatement(stmt, callback)) return true;
  }
  return false;
}

function walkCommand(
  cmd: Command,
  callback: (cmd: SimpleCommand) => boolean | undefined,
): boolean {
  switch (cmd.type) {
    case "SimpleCommand":
      return callback(cmd) === true;

    case "Pipeline":
      return walkStatements(cmd.commands, callback);

    case "Logical":
      return (
        walkStatement(cmd.left, callback) || walkStatement(cmd.right, callback)
      );

    case "Subshell":
    case "Block":
      return walkStatements(cmd.body, callback);

    case "IfClause":
      return (
        walkStatements(cmd.cond, callback) ||
        walkStatements(cmd.then, callback) ||
        (cmd.else ? walkStatements(cmd.else, callback) : false)
      );

    case "ForClause":
    case "SelectClause":
    case "WhileClause":
      return (
        ("cond" in cmd && cmd.cond
          ? walkStatements(cmd.cond, callback)
          : false) || walkStatements(cmd.body, callback)
      );

    case "CaseClause":
      for (const item of cmd.items) {
        if (walkStatements(item.body, callback)) return true;
      }
      return false;

    case "FunctionDecl":
      return walkStatements(cmd.body, callback);

    case "TimeClause":
      return walkStatement(cmd.command, callback);

    case "CoprocClause":
      return walkStatement(cmd.body, callback);

    case "CStyleLoop":
      return walkStatements(cmd.body, callback);

    // These don't contain nested commands we need to walk
    case "TestClause":
    case "ArithCmd":
    case "DeclClause":
    case "LetClause":
      return false;
  }
}
