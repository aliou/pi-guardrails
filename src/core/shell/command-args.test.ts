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
    expect(tokens("/usr/bin/find", ["./src", "-name", "*.ts"])).toEqual([
      "./src",
    ]);
  });

  // Regression: github issue #79 — escaped parens from `find ... \( ... \)`
  // become `\` words, which resolve to the drive root on Windows
  // (resolve("D:\\Code\\app", "\\") === "D:\\") and trigger a bogus
  // outside-workspace prompt.
  it("ignores escaped parens and operators in find expressions", () => {
    expect(
      tokens("find", [
        "D:/Code/wandering-alchemist",
        "-type",
        "f",
        "\\",
        "-name",
        "*.cs",
        "-o",
        "-name",
        "*.gd",
        "\\",
      ]),
    ).toEqual(["D:/Code/wandering-alchemist"]);
  });

  it("keeps multiple find roots before the expression", () => {
    expect(
      tokens("find", [
        "./src",
        "./tests",
        "-name",
        "*.ts",
        "-o",
        "-name",
        "*.tsx",
      ]),
    ).toEqual(["./src", "./tests"]);
  });

  // xargs forwards args to a nested command; classification must apply to
  // the wrapped command. With per-command pattern classifiers gone, what
  // this still buys is interpreter handling behind the pipe.
  it("classifies xargs-wrapped commands as their inner command", () => {
    expect(
      classifyCommandArgs("xargs", ["bash", "-c", "cat /etc/passwd"]),
    ).toEqual([{ token: "cat /etc/passwd", recurseShell: true }]);
  });

  it("skips xargs option values before the wrapped command", () => {
    expect(
      classifyCommandArgs("xargs", ["-I", "{}", "sh", "-c", "cat /etc/passwd"]),
    ).toEqual([{ token: "cat /etc/passwd", recurseShell: true }]);
  });

  it("keeps xargs-wrapped file operands", () => {
    expect(tokens("xargs", ["grep", "pattern", "./src"])).toEqual([
      "pattern",
      "./src",
    ]);
  });

  // Pattern-shaped arguments are no longer special-cased per command. They are
  // returned here and filtered downstream by shape/plausibility checks in
  // extractBashPathCandidates, which covers every CLI rather than a list.
  it.each([
    ["awk", ["/aaa/{print}", "./input"]],
    ["sed", ["s#/old#/new#g", "./file"]],
    ["grep", ["/api/v1", "./src"]],
    ["grep", ["-l", "Hitbox\\|hitbox\\|IsChisel", "./src"]],
    ["rg", ["/api/v1", "./src"]],
    ["jq", ['.path | test("^/tmp/")', "./data.json"]],
    ["go", ["test", "./..."]],
    ["ctx7", ["docs", "/websites/apisix"]],
  ])("delegates %s arguments to downstream filtering", (command, args) => {
    expect(tokens(command, args)).toEqual(args);
  });

  describe("find expressions", () => {
    it("keeps find roots and ignores expression patterns", () => {
      expect(tokens("find", ["./src", "-regex", ".*/test/.*"])).toEqual([
        "./src",
      ]);
    });
  });

  describe("interpreters", () => {
    it("extracts paths from interpreter inline code", () => {
      expect(tokens("python3", ["-c", 'open("/etc/passwd")'])).toEqual([
        "/etc/passwd",
      ]);
    });

    it("marks shell -c code for recursion", () => {
      expect(classifyCommandArgs("sh", ["-c", "cat /etc/passwd"])).toEqual([
        { token: "cat /etc/passwd", recurseShell: true },
      ]);
    });

    it("handles PowerShell flag casing and aliases", () => {
      expect(tokens("powershell", ["-c", "Get-Content /etc/passwd"])).toEqual([
        "/etc/passwd",
      ]);
      expect(tokens("pwsh", ["-COMMAND", "Get-Content /etc/passwd"])).toEqual([
        "/etc/passwd",
      ]);
    });

    it("skips PowerShell -EncodedCommand values", () => {
      expect(tokens("powershell", ["-e", "ZgBvAG8A"])).toEqual([]);
    });

    it("keeps shell script operands", () => {
      expect(tokens("bash", ["./setup.sh"])).toEqual(["./setup.sh"]);
    });

    it("keeps interpreter script operands", () => {
      expect(tokens("python3", ["./script.py", "./data.json"])).toEqual([
        "./script.py",
        "./data.json",
      ]);
    });
  });

  describe("delimiter arguments", () => {
    // A `/` delimiter exists on every filesystem, so no plausibility check can
    // reject it. These stay hardcoded.
    it("ignores delimiter args", () => {
      expect(tokens("cut", ["-d", "/", "./file"])).toEqual(["./file"]);
      expect(tokens("sort", ["-t", "/", "./file"])).toEqual(["./file"]);
      expect(tokens("tr", ["/", ":"])).toEqual([]);
    });
  });
});
