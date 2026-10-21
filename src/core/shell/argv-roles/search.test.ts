import { describe, expect, it } from "vitest";
import { classifyInvocation } from "./index";
import { wordsOf } from "./test-helpers";

function roles(source: string): string[] {
  const { name, args } = wordsOf(source);
  return classifyInvocation(name, args).map((cw) => cw.role);
}

describe("search family (#134)", () => {
  it("classifies the pattern operand as pattern even when quoted and slash-leading", () => {
    expect(roles('grep -rn "/transition" tests')).toEqual([
      "none",
      "pattern",
      "path",
    ]);
  });

  it("classifies an unquoted pattern operand as pattern too", () => {
    expect(roles("grep -rn /transition tests")).toEqual([
      "none",
      "pattern",
      "path",
    ]);
  });

  it("keeps the search root a path", () => {
    expect(roles("grep -rn foo /")).toEqual(["none", "pattern", "path"]);
    expect(roles("grep -rn foo ~")).toEqual(["none", "pattern", "path"]);
  });

  it("classifies -e/--regexp values as patterns", () => {
    expect(roles('grep -e "/a" --regexp=/b /etc')).toEqual([
      "none",
      "pattern",
      "pattern",
      "path",
    ]);
  });

  it("reads attached short-option values without consuming the next word", () => {
    expect(roles("grep -ePATTERN /outside/file")).toEqual(["pattern", "path"]);
    expect(roles("grep -m5 pat /outside/file")).toEqual([
      "option-value",
      "pattern",
      "path",
    ]);
  });

  it("unpacks grouped short options whose last letter takes a value", () => {
    expect(roles("grep -ne pat /outside/file")).toEqual([
      "none",
      "pattern",
      "path",
    ]);
    expect(roles("grep -nePAT /outside/file")).toEqual(["pattern", "path"]);
  });

  it("classifies -f values as paths (pattern files are real files)", () => {
    expect(roles("grep -f patterns.txt /etc")).toEqual([
      "none",
      "path",
      "path",
    ]);
  });

  it("treats words after -- as positionals", () => {
    expect(roles("grep -rn -- '/pat' /")).toEqual([
      "none",
      "none",
      "pattern",
      "path",
    ]);
  });

  it("keeps data-valued options out of pattern position", () => {
    expect(roles("grep -m 5 '/pat' file")).toEqual([
      "none",
      "option-value",
      "pattern",
      "path",
    ]);
  });

  it("never misreads division inside a quoted pattern as a root path", () => {
    const { name, args } = wordsOf("grep -c 'bandW \\* 2 / 3' content04.js");
    const classified = classifyInvocation(name, args);
    expect(classified.map((c) => c.role)).toEqual(["none", "pattern", "path"]);
    expect(classified[1]?.text).toBe("bandW \\* 2 / 3");
    expect(classified[1]?.quoted).toBe(true);
  });

  it("exposes quoting and expansion provenance", () => {
    const { name, args } = wordsOf("grep -c 'bandW' \"$DIR\" f");
    const [flag, pattern, dir, file] = classifyInvocation(name, args);
    expect(flag?.quoted).toBe(false);
    expect(pattern?.quoted).toBe(true);
    expect(pattern?.hasExpansion).toBe(false);
    expect(dir?.quoted).toBe(true);
    expect(dir?.hasExpansion).toBe(true);
    expect(file?.quoted).toBe(false);
    expect(file?.hasExpansion).toBe(false);
  });
});
