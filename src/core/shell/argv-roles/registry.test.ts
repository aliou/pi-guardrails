import type { SimpleCommand, Word } from "@aliou/sh";
import { parse } from "@aliou/sh";
import { describe, expect, it } from "vitest";
import { classifyInvocation, commandFamily } from "./index";
import { wordIsFullyQuoted } from "./roles";
import { wordsOf } from "./test-helpers";

describe("commandFamily", () => {
  it("maps commands to their families", () => {
    expect(commandFamily("grep")).toBe("search");
    expect(commandFamily("/usr/bin/rg")).toBe("search");
    expect(commandFamily("GREP")).toBe("search");
    expect(commandFamily("find")).toBe("find");
    expect(commandFamily("node")).toBe("interpreter");
    expect(commandFamily("ssh")).toBe("remote");
    expect(commandFamily("echo")).toBe("no-file-operand");
    expect(commandFamily("xargs")).toBe("nested-command");
    expect(commandFamily("totally-unknown-cmd")).toBe("generic");
  });
});

describe("generic fallback", () => {
  function roles(source: string): string[] {
    const { name, args } = wordsOf(source);
    return classifyInvocation(name, args).map((cw) => cw.role);
  }

  it("keeps every non-option word an operand", () => {
    expect(roles("foo bar /baz")).toEqual(["operand", "operand"]);
  });

  it("keeps the generic fallback exactly legacy: flags stay candidates", () => {
    expect(roles("foo --flag /some/where")).toEqual(["operand", "operand"]);
  });
});

describe("wordIsFullyQuoted", () => {
  it("detects fully quoted words", () => {
    const { ast } = parse("cmd '/x' \"y\" z p'$X'q");
    const cmd = (ast.body[0]?.command ?? undefined) as SimpleCommand;
    const [, a, b, c, d] = cmd.words ?? [];
    expect(wordIsFullyQuoted(a as Word)).toBe(true);
    expect(wordIsFullyQuoted(b as Word)).toBe(true);
    expect(wordIsFullyQuoted(c as Word)).toBe(false);
    expect(wordIsFullyQuoted(d as Word)).toBe(false);
  });
});
