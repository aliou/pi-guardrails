import { homedir } from "node:os";
import { vol } from "memfs";
import { beforeEach, describe, expect, it } from "vitest";
import { extractBashPathCandidates } from "./bash-paths";

const CWD = "/work/project";
const HOME = homedir();

// Outside-workspace candidates are now checked against the filesystem: a
// token whose path and parent directory are both missing is treated as a
// misparsed identifier rather than a path. Seed the tree these tests assume.
beforeEach(() => {
  vol.fromJSON({
    "/etc/hosts": "",
    "/etc/passwd": "",
    "/tmp/.keep": "",
    "/var/log/system.log": "",
    "/a": "",
    "/b": "",
    "/work/project/.keep": "",
    "/work/project/client.py": "",
    "/work/project/deploy.py": "",
    "/work/project/report.txt": "",
    "/work/project/secrets.txt": "",
    "/work/project/scripts/call_api.js": "",
    "/work/project/scripts/read_file.js": "",
    [`${HOME}/.keep`]: "",
  });
});

describe("extractBashPathCandidates", () => {
  it("does not extract go package wildcard patterns as paths", async () => {
    const result = await extractBashPathCandidates("go test ./...", CWD);

    expect(result).toEqual([]);
  });

  it("no longer force-extracts bare go run operands", async () => {
    // `main.go` has no separator, so it is not path-like — the same rule that
    // already applies to `cat README.md`. It resolves inside the workspace
    // either way, so path-access allows it.
    const result = await extractBashPathCandidates("go run main.go", CWD);

    expect(result).toEqual([]);
  });

  it("surfaces the directory go -C changes into", async () => {
    // `go -C /tmp` really does operate outside the workspace.
    const result = await extractBashPathCandidates(
      "go -C /tmp test ./...",
      CWD,
    );

    expect(result).toEqual(["/tmp"]);
  });

  describe("when a command has regular expression arguments", () => {
    it("keeps sed expressions in-workspace and extracts file operands", async () => {
      // The script token is noise, but it resolves inside the workspace where
      // checkPathAccess always allows, so it cannot produce a prompt.
      const result = await extractBashPathCandidates(
        "sed 's/abc/{2,3}/g' ./file",
        CWD,
      );
      expect(result).toEqual([
        "/work/project/s/abc/{2,3}/g",
        "/work/project/file",
      ]);
    });

    it("ignores grep patterns and extracts file operands", async () => {
      const result = await extractBashPathCandidates(
        "grep '/api/v1' ./src",
        CWD,
      );
      expect(result).toEqual(["/work/project/src"]);
    });

    it("ignores ripgrep patterns and extracts search roots", async () => {
      const result = await extractBashPathCandidates("rg '/api/v1' ./src", CWD);
      expect(result).toEqual(["/work/project/src"]);
    });

    it("keeps jq filters in-workspace and extracts file operands", async () => {
      const result = await extractBashPathCandidates(
        "jq '.path | test(\"^/tmp/\")' ./data.json",
        CWD,
      );
      expect(result).toEqual([
        '/work/project/.path | test("^/tmp/")',
        "/work/project/data.json",
      ]);
    });

    it("extracts paths from interpreter inline code", async () => {
      const result = await extractBashPathCandidates(
        "python3 -c 'open(\"/etc/passwd\").read()'",
        CWD,
      );
      expect(result).toEqual(["/etc/passwd"]);
    });

    it("recursively extracts paths from nested shell -c programs", async () => {
      const result = await extractBashPathCandidates(
        "sh -c 'cat /etc/passwd > /tmp/x'",
        CWD,
      );
      expect(result).toEqual(["/tmp/x", "/etc/passwd"]);
    });

    it("extracts paths from ash -c programs", async () => {
      const result = await extractBashPathCandidates(
        "ash -c 'cat /etc/passwd'",
        CWD,
      );
      expect(result).toEqual(["/etc/passwd"]);
    });

    it("bounds nested shell recursion depth", async () => {
      // Build 5 levels of sh -c wrapping a cat. This exceeds MAX_SHELL_DEPTH,
      // so recursion stops before the innermost cat is parsed: /etc/passwd is
      // not extracted and no fake cwd-relative candidate leaks. Uses the
      // '"'"' single-quote escape trick that @aliou/sh parses cleanly.
      let cmd = "cat /etc/passwd";
      for (let i = 0; i < 5; i++) {
        cmd = `sh -c '${cmd.replace(/'/g, "'\"'\"'")}'`;
      }
      const result = await extractBashPathCandidates(cmd, CWD);
      expect(result).toEqual([]);
    });

    it("extracts paths from node -e inline code", async () => {
      const result = await extractBashPathCandidates(
        'node -e \'require("fs").readFileSync("/etc/passwd")\'',
        CWD,
      );
      expect(result).toEqual(["/etc/passwd"]);
    });
  });

  describe("when command has interpreter arguments", () => {
    it("ignores an API endpoint passed to a Node script", async () => {
      const command =
        "node ./scripts/call_api.js --endpoint /safety/location/record/add --payload '{}'";

      expect(await extractBashPathCandidates(command, CWD)).toEqual([
        `${CWD}/scripts/call_api.js`,
      ]);
      expect(
        await extractBashPathCandidates(
          "node ./scripts/call_api.js --endpoint '/safety/location/record/add' --payload '{}'",
          CWD,
        ),
      ).toEqual([`${CWD}/scripts/call_api.js`]);
    });

    it("ignores an API path passed to a Python script", async () => {
      expect(
        await extractBashPathCandidates(
          "python3 ./client.py /v1/users/me",
          CWD,
        ),
      ).toEqual([`${CWD}/client.py`]);
    });

    it("applies the same filtering inside a nested shell", async () => {
      expect(
        await extractBashPathCandidates(
          "bash -c 'node ./scripts/call_api.js --endpoint /safety/location/record/add'",
          CWD,
        ),
      ).toEqual([`${CWD}/scripts/call_api.js`]);
    });

    it("keeps inline program paths separate from script argv", async () => {
      expect(
        await extractBashPathCandidates(
          `python3 -c 'open("/exfil/sub/data", "w")' --endpoint /v1/users/me`,
          CWD,
        ),
      ).toEqual(["/exfil/sub/data"]);
    });

    it("still surfaces an existing path passed as script argv", async () => {
      expect(
        await extractBashPathCandidates(
          "node ./scripts/read_file.js /etc/passwd",
          CWD,
        ),
      ).toEqual([`${CWD}/scripts/read_file.js`, "/etc/passwd"]);
    });

    it("treats missing script argv like other command arguments", async () => {
      expect(
        await extractBashPathCandidates(
          "python3 ./deploy.py /exfil/new/data",
          CWD,
        ),
      ).toEqual([`${CWD}/deploy.py`]);
    });
  });

  // Regression: github issue #32 — awk regex patterns should not be
  // treated as file paths.
  it("does not extract awk regex patterns as paths", async () => {
    const result = await extractBashPathCandidates(
      "awk '/aaa/{flag=1} flag{print}' test.txt",
      CWD,
    );
    // The awk program should NOT be treated as a path
    expect(result).toEqual([]);
  });

  // Regression: github issue #79 — `find <dir> \( ... \) | xargs grep -l
  // "a\|b"` produces `\` words and an escaped-pipe grep pattern that were
  // treated as paths. On Windows, resolve(cwd, "\\") collapses to the drive
  // root (D:\), triggering a bogus outside-workspace prompt.
  it("ignores find expression tokens and xargs grep patterns", async () => {
    const result = await extractBashPathCandidates(
      'find ./src -type f \\( -name "*.cs" -o -name "*.gd" \\) | xargs grep -l "Hitbox\\|hitbox" 2>/dev/null',
      CWD,
    );

    // The `\` words are gone (that was the drive-root bug). The grep pattern
    // now survives classification as in-workspace noise, which cannot prompt;
    // what matters is that nothing outside the workspace is invented.
    expect(result.filter((path) => !path.startsWith(`${CWD}/`))).toEqual([
      "/dev/null",
    ]);
    expect(result).toContain(`${CWD}/src`);
    expect(result).not.toContain(CWD);
  });

  describe("when command has path arguments", () => {
    it("extracts a single absolute path", async () => {
      expect(await extractBashPathCandidates("cat /etc/hosts", CWD)).toEqual([
        "/etc/hosts",
      ]);
    });

    it("extracts multiple absolute paths", async () => {
      expect(await extractBashPathCandidates("cp /a /b", CWD)).toEqual([
        "/a",
        "/b",
      ]);
    });

    it.each([
      ["cat ./secrets.txt /etc/passwd", [`${CWD}/secrets.txt`, "/etc/passwd"]],
      [
        "awk '/root/ { print }' ./secrets.txt /etc/passwd",
        [`${CWD}/secrets.txt`, "/etc/passwd"],
      ],
      [
        "grep root ./secrets.txt /etc/passwd",
        [`${CWD}/secrets.txt`, "/etc/passwd"],
      ],
      [
        "diff -u ./report.txt /var/log/system.log",
        [`${CWD}/report.txt`, "/var/log/system.log"],
      ],
      [
        "cp ./secrets.txt /tmp/secrets-copy.txt",
        [`${CWD}/secrets.txt`, "/tmp/secrets-copy.txt"],
      ],
      [
        "install -m 600 ./secrets.txt /tmp/secrets-installed.txt",
        [`${CWD}/secrets.txt`, "/tmp/secrets-installed.txt"],
      ],
      [
        "tar -cf /tmp/project-secret.tar ./secrets.txt",
        ["/tmp/project-secret.tar", `${CWD}/secrets.txt`],
      ],
    ])("extracts every path operand in %s", async (command, expected) => {
      expect(await extractBashPathCandidates(command, CWD)).toEqual(expected);
    });

    it("resolves a relative path with ./ against cwd", async () => {
      expect(await extractBashPathCandidates("cat ./foo/bar", CWD)).toEqual([
        "/work/project/foo/bar",
      ]);
    });

    it("expands ~ to home", async () => {
      expect(await extractBashPathCandidates("cat ~/file", CWD)).toEqual([
        `${HOME}/file`,
      ]);
    });

    it("detects Windows-style paths", async () => {
      // Quoted backslashes survive bash escape processing.
      const quoted = await extractBashPathCandidates(
        'type "C:\\foo\\bar"',
        CWD,
      );
      expect(quoted).toHaveLength(1);
      expect(quoted[0]).toContain("C:\\foo\\bar");

      // Forward-slash drive paths need no quoting.
      const fwd = await extractBashPathCandidates("ls D:/Code/app", CWD);
      expect(fwd).toHaveLength(1);
      expect(fwd[0]).toContain("D:/Code/app");
    });
  });

  describe("when command has flags and redirects", () => {
    it("ignores flag arguments", async () => {
      expect(await extractBashPathCandidates("ls -la /tmp", CWD)).toEqual([
        "/tmp",
      ]);
    });

    it("extracts redirect targets", async () => {
      expect(
        await extractBashPathCandidates("echo foo > /tmp/out", CWD),
      ).toEqual(["/tmp/out"]);
    });

    it("extracts paths from multiple commands and redirects", async () => {
      expect(
        await extractBashPathCandidates(
          "cat ./input && grep needle /tmp/log > ./out",
          CWD,
        ),
      ).toEqual(["/work/project/input", "/work/project/out", "/tmp/log"]);
    });

    it("extracts trailing redirects attached to compound commands", async () => {
      // @aliou/sh ≤0.2.2 surfaced compound trailing redirects as an
      // anonymous SimpleCommand; 0.3.x attaches them to the compound node.
      for (const command of [
        "{ echo hi; } > /tmp/out",
        "( echo hi ) > /tmp/out",
        "if true; then echo hi; fi > /tmp/out",
        'while read l; do echo "$l"; done < /tmp/hosts',
      ]) {
        const result = await extractBashPathCandidates(command, CWD);
        expect(result.length).toBeGreaterThan(0);
      }
    });

    it("ignores file-descriptor duplication redirects", async () => {
      // `2>&1` and friends target fds, not files — must not extract `1`.
      expect(await extractBashPathCandidates("echo hi 2>&1", CWD)).toEqual([]);
      expect(await extractBashPathCandidates("cat file 3<&0", CWD)).toEqual([]);
      expect(await extractBashPathCandidates("exec 3>&-", CWD)).toEqual([]);
      // `&>` redirects stdout AND stderr to a real file — keep it.
      expect(
        await extractBashPathCandidates("echo hi &> /tmp/log", CWD),
      ).toEqual(["/tmp/log"]);
    });
  });

  describe("when a command uses heredocs", () => {
    it("does not treat heredoc delimiters as paths", async () => {
      expect(
        await extractBashPathCandidates("cat <<'EOF'\nnot a path\nEOF", CWD),
      ).toEqual([]);
      expect(
        await extractBashPathCandidates(
          "cat > out.txt <<'EOF'\ntext\nEOF",
          CWD,
        ),
      ).toEqual(["/work/project/out.txt"]);
    });

    it("does not extract paths written inside heredoc bodies", async () => {
      expect(
        await extractBashPathCandidates(
          "cat <<'EOF'\nread /etc/hosts here\nEOF",
          CWD,
        ),
      ).toEqual([]);
    });
  });

  describe("when a command uses comments", () => {
    // Valid bash: a `#` comment after |, && or || continues the pipeline on
    // the next line. Extraction must ignore the comment's text and keep the
    // command that continues after it. Comment extraction here relies on
    // @aliou/sh accepting operator continuations (fixed upstream in
    // aliou/sh#24); it.fails flips red once the dependency bump to that
    // release makes the expectation pass, telling us to drop the marker.
    it.fails("ignores comment text after an operator, keeping the continuation", async () => {
      expect(
        await extractBashPathCandidates(
          "echo ok && # see /secret/db.pem\ncat /tmp/log",
          CWD,
        ),
      ).toEqual(["/tmp/log"]);
    });

    it("does not treat URL fragments as paths", async () => {
      expect(
        await extractBashPathCandidates(
          "open https://example.com/#/helm/state-backend",
          CWD,
        ),
      ).toEqual([]);
    });
  });

  describe("when tokens resolve to the filesystem root", () => {
    it("never returns the root as a prompt target", async () => {
      expect(await extractBashPathCandidates("cat //", CWD)).toEqual([]);
    });
  });

  describe("when command has no path-like tokens", () => {
    it("returns an empty array for bare filenames (no separators)", async () => {
      expect(await extractBashPathCandidates("cat README.md", CWD)).toEqual([]);
    });

    it("returns an empty array for commands with no file arguments", async () => {
      expect(await extractBashPathCandidates("echo hello", CWD)).toEqual([]);
    });
  });

  describe("when command uses quoting", () => {
    it("handles quoted paths with spaces", async () => {
      expect(
        await extractBashPathCandidates('cat "/tmp/hello world"', CWD),
      ).toEqual(["/tmp/hello world"]);
    });
  });

  describe("when command has duplicate paths", () => {
    it("deduplicates results", async () => {
      expect(await extractBashPathCandidates("cat /a /a", CWD)).toEqual(["/a"]);
    });
  });

  describe("when command is malformed", () => {
    it("falls back to regex tokenization on parse failure", async () => {
      // Unbalanced quote triggers parse error; regex fallback still finds paths
      const result = await extractBashPathCandidates(
        "cat /tmp/foo 'unterminated",
        CWD,
      );
      expect(result).toContain("/tmp/foo");
    });
  });
});
