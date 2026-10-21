import type {
  ArithExpr,
  ArrayElem,
  ArrayExpr,
  Assignment,
  Command,
  Program,
  Redirect,
  SimpleCommand,
  Statement,
  TestExpr,
  Word,
  WordPart,
} from "@aliou/sh";

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

export function wordHasExpansion(word: Word): boolean {
  return (word.parts ?? []).some(partHasExpansion);
}

export function isFdDuplicationRedirect(redirect: Redirect): boolean {
  if (redirect.op === "<&") return true;
  if (redirect.op !== ">&") return false;
  if (redirect.fd !== undefined) return true;

  const target = wordToString(redirect.target);
  return target === "-" || /^\d+$/.test(target);
}

export function isHeredocRedirect(redirect: Redirect): boolean {
  return redirect.op === "<<" || redirect.op === "<<-" || redirect.op === "<<<";
}

function partHasExpansion(part: WordPart): boolean {
  switch (part.type) {
    case "Literal":
    case "SglQuoted":
      return false;
    case "DblQuoted":
      return (part.parts ?? []).some(partHasExpansion);
    default:
      return true;
  }
}

export type CommandCallback = (
  cmd: SimpleCommand | undefined,
  redirects: Redirect[] | undefined,
  scope: CommandScope,
) => boolean | undefined;

export type CommandScope = {
  parent: CommandScope | undefined;
};

export type WalkCommandsOptions = {
  includeSubstitutions?: boolean;
};

export function walkCommands(
  node: Program,
  callback: CommandCallback,
  options: WalkCommandsOptions = {},
): void {
  walkStatements(node.body, callback, options, { parent: undefined });
}

function hasRedirect(redirects: Redirect[] | undefined): boolean {
  return redirects !== undefined && redirects.length > 0;
}

function walkStatement(
  stmt: Statement,
  callback: CommandCallback,
  options: WalkCommandsOptions,
  scope: CommandScope,
): boolean {
  const stmtScope = stmt.background ? { parent: scope } : scope;
  return walkCommand(stmt.command, callback, options, stmtScope);
}

function walkStatements(
  stmts: Statement[],
  callback: CommandCallback,
  options: WalkCommandsOptions,
  scope: CommandScope,
): boolean {
  for (const stmt of stmts) {
    if (walkStatement(stmt, callback, options, scope)) return true;
  }
  return false;
}

function walkCommand(
  cmd: Command,
  callback: CommandCallback,
  options: WalkCommandsOptions,
  scope: CommandScope,
): boolean {
  return (
    walkCommandBody(cmd, callback, options, scope) ||
    (options.includeSubstitutions === true &&
      walkSubstitutions(cmd, callback, options, scope))
  );
}

function walkCommandBody(
  cmd: Command,
  callback: CommandCallback,
  options: WalkCommandsOptions,
  scope: CommandScope,
): boolean {
  const redirects = "redirects" in cmd ? cmd.redirects : undefined;

  switch (cmd.type) {
    case "SimpleCommand":
      return callback(cmd, redirects, scope) === true;

    case "Pipeline":
      for (const stmt of cmd.commands) {
        if (walkStatement(stmt, callback, options, { parent: scope })) {
          return true;
        }
      }
      return false;

    case "Logical":
      return (
        walkStatement(cmd.left, callback, options, scope) ||
        walkStatement(cmd.right, callback, options, scope)
      );

    case "Subshell":
      if (
        hasRedirect(redirects) &&
        callback(undefined, redirects, scope) === true
      ) {
        return true;
      }
      return walkStatements(cmd.body, callback, options, { parent: scope });

    case "Block":
      if (
        hasRedirect(redirects) &&
        callback(undefined, redirects, scope) === true
      ) {
        return true;
      }
      return walkStatements(cmd.body, callback, options, scope);

    case "IfClause":
      if (
        hasRedirect(redirects) &&
        callback(undefined, redirects, scope) === true
      ) {
        return true;
      }
      return (
        walkStatements(cmd.cond, callback, options, scope) ||
        walkStatements(cmd.then, callback, options, scope) ||
        (cmd.else ? walkStatements(cmd.else, callback, options, scope) : false)
      );

    case "ForClause":
    case "SelectClause":
    case "WhileClause": {
      if (
        hasRedirect(redirects) &&
        callback(undefined, redirects, scope) === true
      ) {
        return true;
      }
      const cond = "cond" in cmd ? cmd.cond : undefined;
      return (
        (cond ? walkStatements(cond, callback, options, scope) : false) ||
        walkStatements(cmd.body, callback, options, scope)
      );
    }

    case "CaseClause":
      if (
        hasRedirect(redirects) &&
        callback(undefined, redirects, scope) === true
      ) {
        return true;
      }
      for (const item of cmd.items) {
        if (walkStatements(item.body, callback, options, scope)) return true;
      }
      return false;

    case "FunctionDecl":
      if (
        hasRedirect(redirects) &&
        callback(undefined, redirects, scope) === true
      ) {
        return true;
      }
      return walkStatements(cmd.body, callback, options, { parent: scope });

    case "TimeClause":
      return walkStatement(cmd.command, callback, options, scope);

    case "CoprocClause":
      if (
        hasRedirect(redirects) &&
        callback(undefined, redirects, scope) === true
      ) {
        return true;
      }
      return walkStatement(cmd.body, callback, options, { parent: scope });

    case "CStyleLoop":
      if (
        hasRedirect(redirects) &&
        callback(undefined, redirects, scope) === true
      ) {
        return true;
      }
      return walkStatements(cmd.body, callback, options, scope);

    case "TestClause":
      if (
        hasRedirect(redirects) &&
        callback(undefined, redirects, scope) === true
      ) {
        return true;
      }
      return false;

    case "ArithCmd":
    case "DeclClause":
    case "LetClause":
      return false;
  }
}

type SubstitutionNode =
  | Command
  | Word
  | WordPart
  | Redirect
  | Assignment
  | ArrayExpr
  | ArrayElem
  | ArithExpr
  | TestExpr;

function walkSubstitutions(
  node: SubstitutionNode,
  callback: CommandCallback,
  options: WalkCommandsOptions,
  scope: CommandScope,
): boolean {
  const visit = (...children: (SubstitutionNode | undefined)[]): boolean =>
    children.some(
      (child) =>
        child !== undefined &&
        walkSubstitutions(child, callback, options, scope),
    );

  if ("redirects" in node && visit(...(node.redirects ?? []))) return true;

  switch (node.type) {
    case "CmdSubst":
    case "ProcSubst":
      return walkStatements(node.stmts, callback, options, { parent: scope });
    case "Word":
    case "DblQuoted":
      return visit(...node.parts);
    case "ParamExp":
      return visit(
        node.index,
        node.exp?.word,
        node.slice?.offset,
        node.slice?.length,
        node.replace?.orig,
        node.replace?.with,
      );
    case "BraceExp":
      return visit(...node.elems);
    case "Redirect":
      return node.op !== "<<" && node.op !== "<<-" && visit(node.target);
    case "SimpleCommand":
      return visit(...(node.words ?? []), ...(node.assignments ?? []));
    case "DeclClause":
      return visit(...(node.args ?? []), ...(node.assigns ?? []));
    case "Assignment":
      return visit(node.value, node.array);
    case "ArrayExpr":
      return visit(...node.elems);
    case "ArrayElem":
      return visit(node.index, node.value);
    case "ForClause":
    case "SelectClause":
      return visit(...(node.items ?? []));
    case "CaseClause":
      return visit(node.word, ...node.items.flatMap((item) => item.patterns));
    case "CStyleLoop":
      return visit(node.init, node.cond, node.post);
    case "LetClause":
      return visit(...node.exprs);
    case "ArithCmd":
    case "ArithExp":
    case "ParenArithm":
    case "UnaryArithm":
    case "TestClause":
    case "ParenTest":
    case "UnaryTest":
      return visit(node.x);
    case "BinaryArithm":
    case "BinaryTest":
      return visit(node.x, node.y);
    default:
      return false;
  }
}
