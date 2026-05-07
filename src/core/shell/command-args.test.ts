import { describe, expect, it } from "vitest";
import { classifyCommandArgs } from "./command-args";

const tokens = (command: string, args: string[]) =>
  classifyCommandArgs(command, args).map((arg) => arg.token);

describe("classifyCommandArgs", () => {
  it("keeps unknown command arguments unchanged", () => {
    expect(tokens("cat", ["/etc/hosts", "./file"])).toEqual([
      "/etc/hosts",
      "./file",
    ]);
  });

  it("normalizes command basenames", () => {
    expect(tokens("/usr/bin/awk", ["/aaa/{print}", "./input"])).toEqual([
      "./input",
    ]);
  });

  it("ignores awk inline program and keeps file operands", () => {
    expect(tokens("awk", ["/aaa/{print}", "./input"])).toEqual(["./input"]);
  });

  it.each([
    ["-f as separate option", ["-f", "./prog.awk", "./input"]],
    ["-f as joined option", ["-f./prog.awk", "./input"]],
  ])("keeps awk program files with %s", (_label, args) => {
    expect(tokens("awk", args)).toEqual(["./prog.awk", "./input"]);
  });

  it("ignores sed inline scripts and keeps file operands", () => {
    expect(tokens("sed", ["s#/old#/new#g", "./file"])).toEqual(["./file"]);
  });

  it.each([
    ["-f as separate option", ["-f", "./script.sed", "./file"]],
    ["--file as long option", ["--file", "./script.sed", "./file"]],
    ["-f as joined option", ["-f./script.sed", "./file"]],
  ])("keeps sed script files with %s", (_label, args) => {
    expect(tokens("sed", args)).toEqual(["./script.sed", "./file"]);
  });

  it("ignores grep patterns and keeps file operands", () => {
    expect(tokens("grep", ["/api/v1", "./src"])).toEqual(["./src"]);
  });

  it.each([
    ["-f as separate option", ["-f", "./patterns", "./src"]],
    ["--file as long option", ["--file", "./patterns", "./src"]],
    ["-f as joined option", ["-f./patterns", "./src"]],
  ])("keeps grep pattern files with %s", (_label, args) => {
    expect(tokens("grep", args)).toEqual(["./patterns", "./src"]);
  });

  it("keeps find roots and ignores expression patterns", () => {
    expect(tokens("find", ["./src", "-regex", ".*/test/.*"])).toEqual([
      "./src",
    ]);
  });

  it("ignores jq filters and keeps file operands", () => {
    expect(tokens("jq", ['.path | test("^/tmp/")', "./data.json"])).toEqual([
      "./data.json",
    ]);
  });

  it.each([
    ["-f as separate option", ["-f", "./filter.jq", "./data.json"]],
    [
      "--from-file as long option",
      ["--from-file", "./filter.jq", "./data.json"],
    ],
  ])("keeps jq filter files with %s", (_label, args) => {
    expect(tokens("jq", args)).toEqual(["./filter.jq", "./data.json"]);
  });

  it("ignores interpreter inline code", () => {
    expect(tokens("python3", ["-c", 'open("/etc/passwd")'])).toEqual([]);
  });

  it("keeps interpreter script operands", () => {
    expect(tokens("python3", ["./script.py", "./data.json"])).toEqual([
      "./script.py",
      "./data.json",
    ]);
  });

  it("ignores delimiter args", () => {
    expect(tokens("cut", ["-d", "/", "./file"])).toEqual(["./file"]);
    expect(tokens("sort", ["-t", "/", "./file"])).toEqual(["./file"]);
    expect(tokens("tr", ["/", ":"])).toEqual([]);
  });
});
