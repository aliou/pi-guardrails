import { describe, expect, it } from "vitest";
import { toClassifiedArgs } from "./index";
import { roleCandidates, wordsOf } from "./test-helpers";

// Pinned expectations. These were first proven byte-identical to the legacy
// `classifyCommandArgs` implementation it replaced; now they pin the behavior
// the new classifier must not drift from.
const PARITY: Array<[string, string[]]> = [
  ["ctx7 docs /websites/apisix", ["docs", "/websites/apisix"]],
  ["foo --flag /some/where", ["--flag", "/some/where"]],
  ["foo bar baz", ["bar", "baz"]],
  ["find / -name x", ["/"]],
  ["find . -name 'a / b'", ["."]],
  ["find . -name '*.js' -type f", ["."]],
  ["find /etc /var -iname '*.log'", ["/etc", "/var"]],
  ["bash -c 'echo /etc/passwd'", ["echo /etc/passwd"]],
  ["sh -c 'cat /secret'", ["cat /secret"]],
  ["bash script.sh /arg", ["script.sh", "/arg"]],
  ["node -e 'console.log(require(p + \"/package.json\").version)'", []],
  ["python3 -c 'open(\"/etc/passwd\")'", ["/etc/passwd"]],
  ["python3 script.py /data", ["script.py", "/data"]],
  ["php -r 'echo 1;' /srv", ["/srv"]],
  ["ssh host cat /etc/passwd", []],
  ["kubectl get pods -- /bin/cat /etc/passwd", ["get", "pods"]],
  ["kubectl logs pod", ["logs", "pod"]],
  ["scp file.txt host:/tmp/x", ["file.txt", "host:/tmp/x"]],
  ["rsync -av /src host:/dst", ["-av", "/src", "host:/dst"]],
  ["echo /etc/passwd", []],
  ["printf '%s' /etc/passwd", []],
  ["tr / :", []],
  ["cut -d / -f2 <<< /etc/passwd", ["-f2"]],
  ["sort -t / -k2 file", ["-k2", "file"]],
  ["xargs -I {} rm {}", ["{}"]],
  ["xargs -0 rm", []],
  ["xargs rm /tmp/x", ["/tmp/x"]],
  ["xargs echo hi", []],
];

const NARROWING_COMMANDS: Array<[string, string[]]> = [
  ['grep -rn "/transition" tests', ["tests"]],
  ["grep -rn /transition tests", ["tests"]],
  ["rg -n '/upload\\|\\.detail\\|413' backend", ["backend"]],
  ["grep -rn '/findings' tests | grep -v '/tests/'", ["tests"]],
  ["grep -c 'bandW \\* 2 / 3' content04.js", ["content04.js"]],
  ["grep --regexp=/transition tests", ["tests"]],
  ["grep -e '/pat' /etc", ["/etc"]],
  ["sed 's|a|b|' /etc/hosts", ["s|a|b|", "/etc/hosts"]],
  [
    "sed -e 's/a/b/' -e 's/c/d/' /etc/hosts",
    ["s/a/b/", "s/c/d/", "/etc/hosts"],
  ],
  ["awk '{print $1}' /etc/passwd", ["{print $1}", "/etc/passwd"]],
  ["awk -F: '{print $1}' /etc/passwd", ["{print $1}", "/etc/passwd"]],
  ["xargs grep foo", []],
];

describe("narrowing families", () => {
  it("narrows the pattern/program words out of the candidate set", () => {
    for (const [source, expected] of NARROWING_COMMANDS) {
      expect(roleCandidates(source), source).toEqual(expected);
    }
  });
});

describe("parity with the legacy per-command special cases", () => {
  it("produces the pinned candidate list for every battery command", () => {
    for (const [source, expected] of PARITY) {
      expect(roleCandidates(source), source).toEqual(expected);
    }
  });

  it("narrows pattern and program words out of the candidate set", () => {
    expect(roleCandidates('grep -rn "/transition" tests')).toEqual(["tests"]);
    expect(roleCandidates("grep -rn /transition tests")).toEqual(["tests"]);
    expect(roleCandidates("grep -rn foo /")).toEqual(["/"]);
    expect(roleCandidates("grep -rn foo ~")).toEqual(["~"]);
  });

  it("preserves legacy flags on candidates (forcePath, recurseShell, programText)", () => {
    const bash = wordsOf("bash -c 'cat /etc/passwd'");
    expect(toClassifiedArgs(bash.name, bash.args)).toEqual([
      { token: "cat /etc/passwd", recurseShell: true },
    ]);

    const node = wordsOf("node -e 'open(\"/etc/passwd\")'");
    expect(toClassifiedArgs(node.name, node.args)).toEqual([
      { token: "/etc/passwd", programText: true },
    ]);
  });
});
