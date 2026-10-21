import { describe, expect, it } from "vitest";
import { classifyInvocation } from "./index";
import { wordsOf } from "./test-helpers";

function roles(source: string): string[] {
  const { name, args } = wordsOf(source);
  return classifyInvocation(name, args).map((cw) => cw.role);
}

describe("stream-editor family", () => {
  it("passes the sed program through as a text operand", () => {
    expect(roles("sed 's|a|b|' /etc/hosts")).toEqual(["text-operand", "path"]);
  });

  it("passes -e values through as text operands", () => {
    expect(roles("sed -e 's/a/b/' /etc/hosts")).toEqual([
      "none",
      "text-operand",
      "path",
    ]);
  });

  it("classifies -f values as script paths", () => {
    expect(roles("sed -f script.sed /etc/hosts")).toEqual([
      "none",
      "path",
      "path",
    ]);
  });
});

describe("awk family", () => {
  it("passes the awk program through as a text operand", () => {
    expect(roles("awk '{print $1}' /etc/passwd")).toEqual([
      "text-operand",
      "path",
    ]);
  });

  it("classifies assignments after the program as data", () => {
    expect(roles("awk '{print $1}' FS=: /etc/passwd")).toEqual([
      "text-operand",
      "option-value",
      "path",
    ]);
  });
});
