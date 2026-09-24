import { parse } from "@aliou/sh";
import { describe, expect, it } from "vitest";
import {
  isFdDuplicationRedirect,
  walkCommands,
  wordHasExpansion,
  wordToString,
} from "./ast";

/** Parse a one-liner and return the first argument word (words[1]). */
function argWord(command: string) {
  const program = parse(command).ast;
  const simple = program.body.find(
    (stmt) => stmt.command.type === "SimpleCommand",
  );
  const words = (simple?.command as { words?: unknown[] }).words ?? [];
  return words[1] as Parameters<typeof wordHasExpansion>[0];
}

describe("walkCommands substitution traversal", () => {
  function commands(command: string, includeSubstitutions?: boolean) {
    const found: string[][] = [];
    walkCommands(
      parse(command).ast,
      (cmd) => {
        if (cmd) found.push((cmd.words ?? []).map(wordToString));
        return false;
      },
      { includeSubstitutions },
    );
    return found;
  }

  it("does not visit substitutions unless opted in", () => {
    const command = 'echo "$(cat .env)"';
    expect(commands(command)).toEqual([["echo", "$(...)"]]);
    expect(commands(command, false)).toEqual([["echo", "$(...)"]]);
  });

  it.each([
    'echo "$(cat .env)"',
    "echo `cat .env`",
    "diff <(cat .env) /dev/null",
    "echo ok > >(cat .env)",
    'echo ok <<< "$(cat .env)"',
    '{ echo ok; } > "$(cat .env)"',
    "value=$(cat .env)",
    "export value=$(cat .env)",
    'values=("$(cat .env)")',
    'let "value=$(cat .env)"',
    'for value in "$(cat .env)"; do echo ok; done',
    'select value in "$(cat .env)"; do break; done',
    'case "$(cat .env)" in *) echo ok;; esac',
    'case value in "$(cat .env)") echo ok;; esac',
    '[[ -n "$(cat .env)" ]]',
    'if true; then echo "$(cat .env)"; fi',
    'while false; do echo "$(cat .env)"; done',
    'f() { echo "$(cat .env)"; }',
  ])("visits an executable substitution once in %j", (command) => {
    expect(
      commands(command, true).filter((words) => words[0] === "cat"),
    ).toEqual([["cat", ".env"]]);
  });

  it("visits nested substitutions once", () => {
    expect(commands('echo "$(printf %s "$(cat .env)")"', true)).toEqual([
      ["echo", "$(...)"],
      ["printf", "%s", "$(...)"],
      ["cat", ".env"],
    ]);
  });

  it.each([
    "echo '$(cat .env)'",
    'echo "\\$(cat .env)"',
    "echo '`cat .env`'",
    "cat <<'EOF'\n$(cat .env)\nEOF\n",
    // Bash performs quote removal, not command substitution, on a delimiter.
    "cat <<$(cat .env)\nbody\n$(cat .env)\n",
  ])("does not interpret literal text or heredoc delimiters in %j", (command) => {
    expect(
      commands(command, true).filter((words) => words.includes(".env")),
    ).toEqual([]);
  });

  it("stops the entire walk when a nested callback returns true", () => {
    const found: string[] = [];
    walkCommands(
      parse('echo "$(cat .env; printf later)"; touch later').ast,
      (cmd) => {
        const name = cmd?.words?.[0];
        if (!name) return false;
        found.push(wordToString(name));
        return wordToString(name) === "cat";
      },
      { includeSubstitutions: true },
    );
    expect(found).toEqual(["echo", "cat"]);
  });

  it("does not visit substitutions after the outer callback stops", () => {
    const found: string[] = [];
    walkCommands(
      parse('echo "$(cat .env)"').ast,
      (cmd) => {
        if (cmd?.words?.[0]) found.push(wordToString(cmd.words[0]));
        return true;
      },
      { includeSubstitutions: true },
    );
    expect(found).toEqual(["echo"]);
  });

  it("stops before compound bodies and redirect substitutions", () => {
    let calls = 0;
    walkCommands(
      parse('{ echo body; } > "$(cat .env)"').ast,
      (cmd, redirects) => {
        calls++;
        expect(cmd).toBeUndefined();
        expect(redirects).toHaveLength(1);
        return true;
      },
      { includeSubstitutions: true },
    );
    expect(calls).toBe(1);
  });

  it("reports compound redirects once inside a substitution", () => {
    const targets: string[] = [];
    walkCommands(
      parse('echo "$({ cat input; } > output)"').ast,
      (_cmd, redirects) => {
        targets.push(...(redirects ?? []).map((r) => wordToString(r.target)));
        return false;
      },
      { includeSubstitutions: true },
    );
    expect(targets).toEqual(["output"]);
  });
});

describe("wordHasExpansion", () => {
  it.each([
    ["head .env", false],
    ["head config/app.json", false],
    ["head 'literal.env'", false],
  ])("reports no expansion for literal %j", (command, expected) => {
    expect(wordHasExpansion(argWord(command))).toBe(expected);
  });

  it.each([
    ['head "$SC/.env"', "dollar var inside double quotes"],
    ["head $SC/.env", "unquoted dollar var"],
    // biome-ignore lint/suspicious/noTemplateCurlyInString: intentional bash braced-variable test input
    ["head ${SC}/.env", "braced var"],
    ['head "$(cat file)"', "command substitution"],
    ['head "$((1+1))"', "arithmetic"],
    ['head "$SC"suffix', "var adjacent to literal"],
    // @aliou/sh 0.2.x parses this into its own WordPart kind; it does not
    // resolve to a single path via wordToString, so it stays conservative.
    ["head ?(secret)/.env", "extended glob"],
  ])("reports expansion for %j (%s)", (command) => {
    expect(wordHasExpansion(argWord(command))).toBe(true);
  });

  it("returns false for a plain double-quoted literal", () => {
    expect(wordHasExpansion(argWord('head "config/.env"'))).toBe(false);
  });
});

describe("isFdDuplicationRedirect", () => {
  it.each([
    ["echo hi 2>&1", true],
    ["echo hi 1>&2", true],
    ["echo hi 3>&-", true],
    ["cat file 3<&0", true],
    ["echo hi >&2", true],
    ["echo hi {out}>&1", true],
    ["echo hi >& .env", false],
    ["echo hi >& /tmp/x", false],
    ["echo hi > /tmp/x", false],
    ["echo hi >> /tmp/x", false],
    ["echo hi < /tmp/x", false],
    ["echo hi &> /tmp/x", false],
    ["echo hi 3> /tmp/x", false],
  ])("classifies %j", (command, expected) => {
    let found = false;
    let result: boolean | undefined;
    walkCommands(parse(command).ast, (_cmd, redirects) => {
      for (const r of redirects ?? []) {
        found = true;
        result = isFdDuplicationRedirect(r);
      }
      return false;
    });
    expect(found).toBe(true);
    expect(result).toBe(expected);
  });
});
