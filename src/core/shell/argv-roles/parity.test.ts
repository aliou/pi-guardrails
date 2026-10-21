import { describe, expect, it } from "vitest";
import { extractProgramTextPaths, toClassifiedArgs } from "./index";
import { legacyCandidates, roleCandidates, wordsOf } from "./test-helpers";

const PARITY_COMMANDS = [
  // generic fallback
  "ctx7 docs /websites/apisix",
  "foo --flag /some/where",
  "foo bar baz",
  // find
  "find / -name x",
  "find . -name 'a / b'",
  "find . -name '*.js' -type f",
  "find /etc /var -iname '*.log'",
  // interpreters (shell family)
  "bash -c 'echo /etc/passwd'",
  "sh -c 'cat /secret'",
  "bash script.sh /arg",
  // interpreters (code family)
  "node -e 'console.log(require(p + \"/package.json\").version)'",
  "python3 -c 'open(\"/etc/passwd\")'",
  "python3 script.py /data",
  "php -r 'echo 1;' /srv",
  // remote
  "ssh host cat /etc/passwd",
  "kubectl get pods -- /bin/cat /etc/passwd",
  "kubectl logs pod",
  "scp file.txt host:/tmp/x",
  "rsync -av /src host:/dst",
  // no-file-operand
  "echo /etc/passwd",
  "printf '%s' /etc/passwd",
  "tr / :",
  // delimiter values
  "cut -d / -f2 <<< /etc/passwd",
  "sort -t / -k2 file",
  // nested command
  "xargs -I {} rm {}",
  "xargs -0 rm",
  "xargs rm /tmp/x",
  "xargs echo hi",
];

const NARROWING_COMMANDS = [
  'grep -rn "/transition" tests',
  "grep -rn /transition tests",
  "rg -n '/upload\\|\\.detail\\|413' backend",
  "grep -rn '/findings' tests | grep -v '/tests/'",
  "grep -c 'bandW \\* 2 / 3' content04.js",
  "grep --regexp=/transition tests",
  "grep -e '/pat' /etc",
  "sed 's|a|b|' /etc/hosts",
  "sed -e 's/a/b/' -e 's/c/d/' /etc/hosts",
  "awk '{print $1}' /etc/passwd",
  "awk -F: '{print $1}' /etc/passwd",
  "xargs grep foo",
];

describe("parity with legacy classifyCommandArgs", () => {
  it("produces identical candidates for ported families", () => {
    for (const source of PARITY_COMMANDS) {
      expect(roleCandidates(source), source).toEqual(legacyCandidates(source));
    }
  });

  it("never widens the candidate set for narrowing families", () => {
    for (const source of NARROWING_COMMANDS) {
      const legacy = new Set(legacyCandidates(source));
      const narrowed = roleCandidates(source);
      for (const token of narrowed) {
        expect(legacy.has(token), `${source}: ${token} not in legacy`).toBe(
          true,
        );
      }
    }
  });

  it("narrows exactly the pattern/program words for the #134 repros", () => {
    expect(roleCandidates('grep -rn "/transition" tests')).toEqual(["tests"]);
    expect(roleCandidates("grep -rn /transition tests")).toEqual(["tests"]);
    expect(roleCandidates("grep -rn foo /")).toEqual(["/"]);
    expect(roleCandidates("grep -rn foo ~")).toEqual(["~"]);
  });

  it("preserves legacy flags on candidates (forcePath, recurseShell, programText)", () => {
    const { name, args } = wordsOf("bash -c 'cat /etc/passwd'");
    const adapted = toClassifiedArgs(name, args);
    expect(adapted).toEqual([{ token: "cat /etc/passwd", recurseShell: true }]);

    const node = wordsOf("node -e 'open(\"/etc/passwd\")'");
    expect(toClassifiedArgs(node.name, node.args)).toEqual([
      { token: "/etc/passwd", programText: true },
    ]);
  });
});

describe("extractProgramTextPaths", () => {
  it("mirrors the legacy program-text tokenizer", () => {
    expect(extractProgramTextPaths('open("/etc/passwd")')).toEqual([
      "/etc/passwd",
    ]);
    expect(extractProgramTextPaths("const x = 1;")).toEqual([]);
  });
});
