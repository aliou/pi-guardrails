import { homedir } from "node:os";
import { describe, expect, it } from "vitest";
import { extractBashPathCandidates } from "./bash-paths";

const CWD = "/work/project";
const HOME = homedir();

describe("extractBashPathCandidates", () => {
  it("does not extract go package wildcard patterns as paths", async () => {
    const result = await extractBashPathCandidates("go test ./...", CWD);

    expect(result).toEqual([]);
  });

  it("extracts go run .go file operands", async () => {
    const result = await extractBashPathCandidates("go run main.go", CWD);

    expect(result).toEqual(["/work/project/main.go"]);
  });

  it("handles go -C global flag", async () => {
    const result = await extractBashPathCandidates(
      "go -C /tmp test ./...",
      CWD,
    );

    expect(result).toEqual([]);
  });

  describe("when a command has regular expression arguments", () => {
    it("ignores sed expressions and extracts file operands", async () => {
      const result = await extractBashPathCandidates(
        "sed 's/abc/{2,3}/g' ./file",
        CWD,
      );
      expect(result).toEqual(["/work/project/file"]);
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

    it("ignores jq filters and extracts file operands", async () => {
      const result = await extractBashPathCandidates(
        "jq '.path | test(\"^/tmp/\")' ./data.json",
        CWD,
      );
      expect(result).toEqual(["/work/project/data.json"]);
    });

    it("ignores interpreter inline code", async () => {
      const result = await extractBashPathCandidates(
        "python3 -c 'open(\"/etc/passwd\").read()'",
        CWD,
      );
      expect(result).toEqual([]);
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
      const result = await extractBashPathCandidates("type C:\\foo\\bar", CWD);

      expect(result).toHaveLength(1);
      expect(result[0]).toContain("C:\\foo\\bar");
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
