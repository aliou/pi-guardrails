import { describe, expect, it } from "vitest";
import { classifyInvocation } from "./index";
import { roleCandidates, wordsOf } from "./test-helpers";

function roles(source: string): string[] {
  const { name, args } = wordsOf(source);
  return classifyInvocation(name, args).map((cw) => cw.role);
}

describe("interpreter family", () => {
  it("classifies shell -c values as program-shell", () => {
    expect(roles("bash -c 'echo hi'")).toEqual(["none", "program-shell"]);
  });

  it("classifies interpreter -e values as program", () => {
    expect(roles("node -e 'console.log(1)'")).toEqual(["none", "program"]);
  });

  it("classifies interpreter script positionals as paths", () => {
    expect(roles("python3 script.py /data")).toEqual(["path", "path"]);
  });

  it("classifies powershell flags case-insensitively", () => {
    expect(roles("pwsh -File script.ps1")).toEqual(["none", "script"]);
  });
});

describe("interpreter program literals", () => {
  it.each([
    ["node -e 'const x=(c+0.055)/1.055; console.log(x)'", []],
    ["node -e 'console.log(require(p + \"/package.json\").version)'", []],
    ["node -e 'const p = \"/etc\" + name'", []],
    ['python3 -c \'print(spec["paths"]["/api/items"])\'', []],
    ["node -e 'console.log(routes()[\"/api/items\"])'", []],
    ['node -e \'open("/etc" + "/" + name)\'', []],
  ])("skips code fragments that are not path operands: %j", (command, expected) => {
    expect(roleCandidates(command)).toEqual(expected);
  });

  it.each([
    ["node -e 'fs.readFile(\"/etc/passwd\", cb)'", ["/etc/passwd"]],
    ['python3 -c \'open("/tmp/new.txt", "w")\'', ["/tmp/new.txt"]],
    ["node -e 'require(\"/srv/index.js\")'", ["/srv/index.js"]],
  ])("keeps quoted literals in call position: %j", (command, expected) => {
    expect(roleCandidates(command)).toEqual(expected);
  });

  it.each([
    ["node -e 'Promise.all([\"/etc/passwd\"].map(read))'", ["/etc/passwd"]],
    [
      'node -e \'read(["/etc/hosts", "/etc/passwd"])\'',
      ["/etc/hosts", "/etc/passwd"],
    ],
    ["python3 -c 'for p in [\"/etc/passwd\"]: open(p)'", ["/etc/passwd"]],
  ])("keeps path-like array elements: %j", (command, expected) => {
    expect(roleCandidates(command)).toEqual(expected);
  });

  it.each([
    ['python3 -c \'open("/etc" + "/passwd")\'', ["/etc/passwd"]],
    ['node -e \'read("/etc" + "/" + "passwd")\'', ["/etc/passwd"]],
  ])("joins constant concatenations: %j", (command, expected) => {
    expect(roleCandidates(command)).toEqual(expected);
  });
});

describe("remote family", () => {
  it("classifies all ssh argv as remote", () => {
    expect(roles("ssh host cat /etc/passwd")).toEqual([
      "remote",
      "remote",
      "remote",
    ]);
  });

  it("classifies kubectl argv after -- as remote", () => {
    expect(roles("kubectl exec pod -- /bin/cat /etc/passwd")).toEqual([
      "operand",
      "operand",
      "none",
      "remote",
      "remote",
    ]);
  });

  it("falls back to generic for scp (legacy parity), classifying both operands", () => {
    expect(roles("scp file.txt host:/tmp/x")).toEqual(["operand", "operand"]);
  });
});

describe("no-file-operand and delimiter-value families", () => {
  it("classifies every echo/printf/tr word as none", () => {
    expect(roles("echo /etc/passwd")).toEqual(["none"]);
    expect(roles("tr / :")).toEqual(["none", "none"]);
  });

  it("classifies delimiter values as option-value", () => {
    expect(roles("cut -d / -f2")).toEqual(["none", "option-value", "operand"]);
  });
});

describe("nested-command family", () => {
  it("re-classifies the wrapped command's argv", () => {
    expect(roles("xargs grep -rn foo /")).toEqual([
      "none",
      "none",
      "pattern",
      "path",
    ]);
  });

  it("handles -0 (flagless) forms", () => {
    expect(roles("xargs -0 rm")).toEqual(["none", "none"]);
  });
});
