/**
 * Shared shell AST helpers used by guardrails hooks.
 *
 * Each hook imports `parse` from `@aliou/sh` directly and uses these
 * for common AST operations.
 */

import type {
  Command,
  Program,
  Redirect,
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

/**
 * Whether a redirect is a file-descriptor duplication (`2>&1`, `3<&0`,
 * `>&-`). Bash also accepts `>& file` as a file redirect when no source fd is
 * specified, so the operator alone is not enough to classify it.
 */
export function isFdDuplicationRedirect(redirect: Redirect): boolean {
  if (redirect.op === "<&") return true;
  if (redirect.op !== ">&") return false;
  if (redirect.fd !== undefined) return true;

  const target = wordToString(redirect.target);
  return target === "-" || /^\d+$/.test(target);
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
 * Callback invoked by {@link walkCommands}.
 *
 * For a simple command, `cmd` is the command and `redirects` its own
 * redirects. Redirects attached to a compound node (`{ …; } > out`,
 * `while … done < in`, …) don't belong to any single nested command, so they
 * are reported once per compound node with `cmd` set to `undefined`. A
 * callback only interested in commands keeps ignoring that call via its
 * existing `words[0]` / `cmd.words` logic; a callback interested in redirect
 * targets should collect from `redirects` on every call.
 *
 * Return `true` to stop the walk early.
 */
export type CommandCallback = (
  cmd: SimpleCommand | undefined,
  redirects?: Redirect[],
) => boolean | undefined;

/**
 * Walk the AST and call `callback` for every SimpleCommand found at any
 * nesting depth, plus once per compound node that carries its own redirects
 * (with `cmd === undefined`). Returns early if callback returns `true`.
 */
export function walkCommands(node: Program, callback: CommandCallback): void {
  for (const stmt of node.body) {
    if (walkStatement(stmt, callback)) return;
  }
}

function hasRedirect(redirects: Redirect[] | undefined): boolean {
  return redirects !== undefined && redirects.length > 0;
}

function walkStatement(stmt: Statement, callback: CommandCallback): boolean {
  return walkCommand(stmt.command, callback);
}

function walkStatements(
  stmts: Statement[],
  callback: CommandCallback,
): boolean {
  for (const stmt of stmts) {
    if (walkStatement(stmt, callback)) return true;
  }
  return false;
}

function walkCommand(cmd: Command, callback: CommandCallback): boolean {
  // Compound nodes may attach trailing redirects (`{ …; } > out`). Collect
  // them before descending so the caller sees the redirect even when the
  // callback would stop the walk inside the body.
  const redirects = "redirects" in cmd ? cmd.redirects : undefined;

  switch (cmd.type) {
    case "SimpleCommand":
      return callback(cmd, redirects) === true;

    case "Pipeline":
      return walkStatements(cmd.commands, callback);

    case "Logical":
      return (
        walkStatement(cmd.left, callback) || walkStatement(cmd.right, callback)
      );

    case "Subshell":
    case "Block":
      if (hasRedirect(redirects) && callback(undefined, redirects) === true) {
        return true;
      }
      return walkStatements(cmd.body, callback);

    case "IfClause":
      if (hasRedirect(redirects) && callback(undefined, redirects) === true) {
        return true;
      }
      return (
        walkStatements(cmd.cond, callback) ||
        walkStatements(cmd.then, callback) ||
        (cmd.else ? walkStatements(cmd.else, callback) : false)
      );

    case "ForClause":
    case "SelectClause":
    case "WhileClause": {
      if (hasRedirect(redirects) && callback(undefined, redirects) === true) {
        return true;
      }
      const cond = "cond" in cmd ? cmd.cond : undefined;
      return (
        (cond ? walkStatements(cond, callback) : false) ||
        walkStatements(cmd.body, callback)
      );
    }

    case "CaseClause":
      if (hasRedirect(redirects) && callback(undefined, redirects) === true) {
        return true;
      }
      for (const item of cmd.items) {
        if (walkStatements(item.body, callback)) return true;
      }
      return false;

    case "FunctionDecl":
      if (hasRedirect(redirects) && callback(undefined, redirects) === true) {
        return true;
      }
      return walkStatements(cmd.body, callback);

    case "TimeClause":
      return walkStatement(cmd.command, callback);

    case "CoprocClause":
      if (hasRedirect(redirects) && callback(undefined, redirects) === true) {
        return true;
      }
      return walkStatement(cmd.body, callback);

    case "CStyleLoop":
      if (hasRedirect(redirects) && callback(undefined, redirects) === true) {
        return true;
      }
      return walkStatements(cmd.body, callback);

    case "TestClause":
      if (hasRedirect(redirects) && callback(undefined, redirects) === true) {
        return true;
      }
      return false;

    // These contain neither nested commands nor redirects
    case "ArithCmd":
    case "DeclClause":
    case "LetClause":
      return false;
  }
}
