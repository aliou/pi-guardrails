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
    case "ParamExp":
      return part.short
        ? `$${part.param.value}`
        : `\${${part.param.value}${part.op ?? ""}${part.value ? wordToString(part.value) : ""}}`;
    case "CmdSubst":
      return "$(...)";
    case "ArithExp":
      return `$((${part.expr}))`;
    case "ProcSubst":
      return `${part.op}(...)`;
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
