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
    "/a": "",
    "/b": "",
    "/work/project/.keep": "",
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
      expect(result).toEqual(["/etc/passwd", "/tmp/x"]);
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
      ).toEqual(["/work/project/input", "/tmp/log", "/work/project/out"]);
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
