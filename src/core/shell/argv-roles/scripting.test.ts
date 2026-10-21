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

  it("keeps every file operand a path after an -e program", () => {
    expect(roles("sed -e 's/a/b/' /a /b")).toEqual([
      "none",
      "text-operand",
      "path",
      "path",
    ]);
  });

  it("reads attached -e programs without consuming the file operand", () => {
    expect(roles("sed -e's/a/b/' /outside/file")).toEqual([
      "text-operand",
      "path",
    ]);
    expect(roles("sed -ne's/a/b/p' /outside/file")).toEqual([
      "text-operand",
      "path",
    ]);
  });

  it("classifies a trailing --expression= word as a text operand", () => {
    expect(roles("sed -n --expression=p")).toEqual(["none", "text-operand"]);
  });

  it("treats the -i suffix as attached to -i only", () => {
    expect(roles("sed -i.tmpl 's/a/b/' /outside/file")).toEqual([
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
