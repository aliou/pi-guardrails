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
    expect(tokens("xargs", ["grep", "pattern", "./src"])).toEqual(["./src"]);
  });

  // Pattern-shaped arguments are no longer special-cased per command. They are
  // returned here and filtered downstream by shape/plausibility checks in
  // extractBashPathCandidates, which covers every CLI rather than a list.
  it.each([
    ["awk", ["/aaa/{print}", "./input"]],
    ["sed", ["s#/old#/new#g", "./file"]],
    ["jq", ['.path | test("^/tmp/")', "./data.json"]],
    ["go", ["test", "./..."]],
    ["ctx7", ["docs", "/websites/apisix"]],
  ])("delegates %s arguments to downstream filtering", (command, args) => {
    expect(tokens(command, args)).toEqual(args);
  });

  describe("search commands", () => {
    it.each([
      ["grep", ["-rn", "/transition", "tests"], ["tests"]],
      ["grep", ["-rn", "src/", "."], ["."]],
      ["egrep", ["/api/v1", "./src"], ["./src"]],
      ["fgrep", ["/api/v1", "./src"], ["./src"]],
      ["rg", ["-n", "/upload|\\.detail|413", "backend"], ["backend"]],
      ["/usr/bin/grep", ["/api/v1", "./src"], ["./src"]],
    ] as const)("treats the pattern of %s as text, not a path", (command, args, expected) => {
      expect(tokens(command, [...args])).toEqual(expected);
    });

    it("keeps every positional after the pattern", () => {
      expect(tokens("grep", ["-rn", "foo", "/"])).toEqual(["/"]);
      expect(tokens("grep", ["/pat", "./a", "./b"])).toEqual(["./a", "./b"]);
    });

    it("treats positionals as files once -e/-f gave the pattern", () => {
      expect(tokens("grep", ["-e", "/pat", "./a", "./b"])).toEqual([
        "./a",
        "./b",
      ]);
      expect(tokens("grep", ["-e/pat", "./a"])).toEqual(["./a"]);
      expect(tokens("grep", ["--regexp=/pat", "./a"])).toEqual(["./a"]);
      expect(tokens("grep", ["-f", "./patterns", "./a"])).toEqual([
        "./patterns",
        "./a",
      ]);
      expect(tokens("grep", ["-fpatterns", "./a"])).toEqual([
        "patterns",
        "./a",
      ]);
      expect(tokens("grep", ["--file=./patterns", "./a"])).toEqual([
        "./patterns",
        "./a",
      ]);
    });

    it("consumes values of value-taking options", () => {
      expect(
        tokens("grep", ["-A", "2", "-B2", "-m", "5", "/pat", "./a"]),
      ).toEqual(["./a"]);
      expect(
        tokens("rg", [
          "--after-context=2",
          "-g",
          "*.ts",
          "-t",
          "ts",
          "-Tmd",
          "--type-not=md",
          "/pat",
          "./a",
        ]),
      ).toEqual(["./a"]);
    });

    it("parses grouped short options getopt-style", () => {
      expect(tokens("grep", ["-nA", "3", "/x", "/etc/hosts"])).toEqual([
        "/etc/hosts",
      ]);
      expect(tokens("grep", ["-rnB2", "/pat", "./a"])).toEqual(["./a"]);
      expect(tokens("grep", ["-inC", "5", "/pat", "./a"])).toEqual(["./a"]);
      expect(tokens("grep", ["-rne", "PAT", "./a"])).toEqual(["./a"]);
      expect(tokens("grep", ["-rlf", "pats", "./a"])).toEqual(["pats", "./a"]);
    });

    it("ends option parsing at --", () => {
      expect(tokens("grep", ["--", "-weird", "./a"])).toEqual(["./a"]);
      expect(tokens("grep", ["-e", "pat", "--", "./a"])).toEqual(["./a"]);
    });
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

    it("marks only inline code paths as program text", () => {
      expect(
        classifyCommandArgs("node", [
          "./scripts/call_api.js",
          "--endpoint",
          "/safety/location/record/add",
          "--payload",
          "{}",
        ]),
      ).toEqual([
        { token: "./scripts/call_api.js" },
        { token: "/safety/location/record/add" },
        { token: "{}" },
      ]);
      expect(
        classifyCommandArgs("python3", ["-c", 'open("/etc/passwd")']),
      ).toEqual([{ token: "/etc/passwd", programText: true }]);
    });

    it("ignores bare code tokens from inline code (issue #136)", () => {
      expect(
        tokens("node", ["-e", "const x=(c+0.055)/1.055; console.log(x)"]),
      ).toEqual([]);
    });

    it("ignores literals glued to + concatenations", () => {
      expect(
        tokens("node", [
          "-e",
          'console.log(require(p + "/package.json").version)',
        ]),
      ).toEqual([]);
      expect(
        tokens("node", ["-e", 'process.env.HOME + "/.pi/agent/npm"']),
      ).toEqual([]);
      expect(tokens("node", ["-e", '"/etc" + "/passwd"'])).toEqual([]);
    });

    it("ignores literals used as subscript keys", () => {
      expect(
        tokens("python3", ["-c", 'print(spec["paths"]["/api/items"])']),
      ).toEqual([]);
    });

    it("keeps literals in call position", () => {
      expect(tokens("node", ["-e", 'open("/etc/passwd")'])).toEqual([
        "/etc/passwd",
      ]);
      expect(tokens("node", ["-e", 'require("/srv/x.js")'])).toEqual([
        "/srv/x.js",
      ]);
      expect(tokens("node", ["-e", 'fs.readFile("/x", cb)'])).toEqual(["/x"]);
    });

    it("keeps array element literals", () => {
      expect(tokens("node", ["-e", '["/etc/passwd"].map(read)'])).toEqual([
        "/etc/passwd",
      ]);
      expect(
        tokens("node", ["-e", 'const list = ["a", "/etc/passwd"]']),
      ).toEqual(["/etc/passwd"]);
    });
  });

  describe("delimiter arguments", () => {
    // A `/` delimiter exists on every filesystem, so no plausibility check can
    // reject it. These stay hardcoded.
    it("ignores delimiter args", () => {
      expect(tokens("cut", ["-d", "/", "./file"])).toEqual(["./file"]);
      expect(tokens("sort", ["-t", "/", "./file"])).toEqual(["./file"]);
    });
  });

  describe("commands without file operands", () => {
    // POSIX defines these grammars as pure text; argv tokens that name real
    // files are data, not file access.
    it("ignores every argument", () => {
      expect(tokens("echo", [".env", "/etc/hosts"])).toEqual([]);
      expect(tokens("printf", ["%s\\n", ".env"])).toEqual([]);
      expect(tokens("tr", ["/", ":"])).toEqual([]);
    });
  });

  describe("remote command runners", () => {
    // Argv naming paths on another machine is not local filesystem access;
    // the rules lean on each command's own contract, not option tables.
    it("drops ssh argv entirely", () => {
      expect(
        tokens("ssh", ["-i", "~/.ssh/id", "user@host", "cat", "/etc/passwd"]),
      ).toEqual([]);
      expect(tokens("ssh", ["user@host"])).toEqual([]);
    });

    it("drops kubectl argv passed through -- to the pod command", () => {
      expect(
        tokens("kubectl", ["exec", "-it", "pod/one", "--", "ls", "/app"]),
      ).toEqual(["exec", "-it", "pod/one"]);
      // Without `--` the argv is kubectl's own and stays classified as-is.
      expect(tokens("kubectl", ["get", "pods"])).toEqual(["get", "pods"]);
    });
  });
});
