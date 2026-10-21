import { describe, expect, it } from "vitest";
import { classifyInvocation } from "./index";
import { legacyCandidates, roleCandidates, wordsOf } from "./test-helpers";

function roles(source: string): string[] {
  const { name, args } = wordsOf(source);
  return classifyInvocation(name, args).map((cw) => cw.role);
}

describe("find family", () => {
  it("classifies roots as paths and pattern option values as patterns", () => {
    expect(roles("find / -name x")).toEqual(["path", "none", "pattern"]);
  });

  it("never yields expression punctuation as a path root", () => {
    expect(roles("find . -name 'a / b'")).toEqual(["path", "none", "pattern"]);
  });

  it("matches legacy: only pre-expression roots are candidates", () => {
    expect(roleCandidates("find . -name '*.js' -type f")).toEqual(
      legacyCandidates("find . -name '*.js' -type f"),
    );
    expect(roleCandidates("find . -name '*.js' -type f")).toEqual(["."]);
  });
});
