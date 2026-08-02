import { parse } from "@aliou/sh";
import { describe, expect, it } from "vitest";
import { wordHasExpansion } from "./ast";

/** Parse a one-liner and return the first argument word (words[1]). */
function argWord(command: string) {
  const program = parse(command).ast;
  const simple = program.body.find(
    (stmt) => stmt.command.type === "SimpleCommand",
  );
  const words = (simple?.command as { words?: unknown[] }).words ?? [];
  return words[1] as Parameters<typeof wordHasExpansion>[0];
}

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
