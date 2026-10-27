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
    "/work/project/README.md": "",
    "/work/project/.pi/.keep": "",
    "/work/project/frontend/app.js": "",
    "/work/project/packages/dashboard/pkg.json": "",
    "/work/project/packages/api/pkg.json": "",
    "/work/outside-note.txt": "",
    "/work/.keep": "",
    [`${HOME}/.keep`]: "",
  });
});

describe("extractBashPathCandidates", () => {
  describe("cd resolution", () => {
    it.each([
      ["cd .pi && cat ../README.md", ["/work/project/README.md"]],
      [
        "cd frontend && pnpm build > ../.pi/build.log 2>&1",
        ["/work/project/.pi/build.log"],
      ],
      [
        "cd packages/dashboard && bun test && cd ../api && uv run pytest",
        ["/work/project/packages/dashboard", "/work/project/packages/api"],
      ],
      ["cd frontend && cat ../app.js", ["/work/project/app.js"]],
    ])("resolves relative paths after cd: %j", async (command, expected) => {
      await expect(extractBashPathCandidates(command, CWD)).resolves.toEqual(
        expected,
      );
    });

    it("resolves nested bash -c programs against the cd target", async () => {
      await expect(
        extractBashPathCandidates(
          "cd frontend && bash -c 'cat ../app.js'",
          CWD,
        ),
      ).resolves.toEqual(["/work/project/app.js"]);
    });

    it("inherits the cd target inside command substitutions", async () => {
      await expect(
        extractBashPathCandidates(
          'cd frontend && echo "$(cat ../app.js)"',
          CWD,
        ),
      ).resolves.toEqual(["/work/project/app.js"]);
    });

    it.each([
      ["(cd frontend && cat ../.pi/x.log)", ["/work/project/.pi/x.log"]],
      [
        "(cd packages/dashboard && bun dev > ../../.pi/tmp/dev.log 2>&1 &)",
        ["/work/project/packages/dashboard", "/work/project/.pi/tmp/dev.log"],
      ],
      [
        "(cd packages/dashboard && for i in 1 2; do bun test > ../../.pi/run-$i.log; done)",
        ["/work/project/packages/dashboard", "/work/project/.pi/run-$i.log"],
      ],
      ["cd frontend && (cd .. && cat ./app.js)", ["/work/project/app.js"]],
      ["{ cd frontend; cat ../README.md; }", ["/work/project/README.md"]],
    ])("tracks cd inside a group: %j", async (command, expected) => {
      await expect(extractBashPathCandidates(command, CWD)).resolves.toEqual(
        expected,
      );
    });

    it.each([
      [
        "(cd frontend && cat ./app.js) && cat ./README.md",
        ["/work/project/frontend/app.js", "/work/project/README.md"],
      ],
      [
        "(cd frontend) > ./out.log; cat ./README.md",
        ["/work/project/out.log", "/work/project/README.md"],
      ],
      ["{ cd frontend; } & cat ./README.md", ["/work/project/README.md"]],
    ])("does not leak cd out of a subshell: %j", async (command, expected) => {
      await expect(extractBashPathCandidates(command, CWD)).resolves.toEqual(
        expected,
      );
    });

    it("keeps cd from a brace group for later statements", async () => {
      await expect(
        extractBashPathCandidates("{ cd frontend; } && cat ./app.js", CWD),
      ).resolves.toEqual(["/work/project/frontend/app.js"]);
    });

    it("resolves pipeline elements against the pre-pipeline directory", async () => {
      await expect(
        extractBashPathCandidates("cd frontend | cat ../README.md", CWD),
      ).resolves.toEqual(["/work/README.md"]);
    });

    it("resolves paths after a cd out of the workspace", async () => {
      await expect(
        extractBashPathCandidates("cd .. && cat ./outside-note.txt", CWD),
      ).resolves.toEqual(["/work/outside-note.txt"]);
    });

    it("resolves a bare cd against HOME", async () => {
      await expect(
        extractBashPathCandidates("cd && cat ./.keep", CWD),
      ).resolves.toEqual([`${HOME}/.keep`]);
    });

    it.each([
      ["background statements", "cd frontend & cat ../README.md"],
      ["coproc bodies", "coproc cd frontend; cat ../README.md"],
      ["coproc blocks", "coproc { cd frontend; }; cat ../README.md"],
    ])("does not leak cd out of %s", async (_label, command) => {
      await expect(extractBashPathCandidates(command, CWD)).resolves.toEqual([
        "/work/README.md",
      ]);
    });

    it("tracks cd inside a background statement", async () => {
      await expect(
        extractBashPathCandidates("cd frontend && cat ../README.md &", CWD),
      ).resolves.toEqual(["/work/project/README.md"]);
    });

    it("resolves an operand after -- as a path", async () => {
      vol.mkdirSync("/work/project/-name");
      await expect(
        extractBashPathCandidates("cd -- -name && cat ../README.md", CWD),
      ).resolves.toEqual(["/work/project/README.md"]);
    });

    it("leaves the directory unchanged when cd has more than one operand", async () => {
      await expect(
        extractBashPathCandidates(
          "cd frontend && cd a b && cat ../README.md",
          CWD,
        ),
      ).resolves.toEqual(["/work/project/README.md"]);
    });

    it("resolves against the session cwd after a cd to a missing directory", async () => {
      await expect(
        extractBashPathCandidates("cd missing; cat ../README.md", CWD),
      ).resolves.toEqual(["/work/README.md"]);
    });

    it.each([
      ["cd $d && cat ../README.md"],
      ["cd frontend && cd - && cat ../README.md"],
      ["cd *.js && cat ../README.md"],
      ["cd frontend && cd missing && cat ../README.md"],
      ["cd frontend && cd -x && cat ../README.md"],
      ["cd frontend && cd -- - && cat ../README.md"],
    ])("falls back to the session cwd when the cd target is untracked: %j", async (command) => {
      await expect(extractBashPathCandidates(command, CWD)).resolves.toEqual([
        "/work/README.md",
      ]);
    });
  });
  describe("executable substitutions", () => {
    it.each([
      'echo "$(cat /etc/passwd)"',
      "echo `cat /etc/passwd`",
      "cat <(cat /etc/passwd)",
      'echo "$(echo "$(cat /etc/passwd)")"',
      'echo "$(echo hi > /etc/passwd)"',
      'echo ok <<< "$(cat /etc/passwd)"',
      'ssh host "$(cat /etc/passwd)"',
      'kubectl exec pod -- echo "$(cat /etc/passwd)"',
      "value=$(cat /etc/passwd)",
      "export value=$(cat /etc/passwd)",
    ])("extracts the locally accessed path in %j", async (command) => {
      await expect(extractBashPathCandidates(command, CWD)).resolves.toEqual([
        "/etc/passwd",
      ]);
    });

    it("extracts paths inside output process substitutions", async () => {
      // The existing extractor also returns the unresolved redirect target.
      const paths = await extractBashPathCandidates(
        "echo ok > >(cat /etc/passwd)",
        CWD,
      );
      expect(paths).toContain("/etc/passwd");
    });

    it.each([
      'echo "$(echo /etc/passwd)"',
      'echo "$(printf %s /etc/passwd)"',
      'echo "$(tr /etc/passwd x)"',
      "echo '$(cat /etc/passwd)'",
      "cat <<'EOF'\n$(cat /etc/passwd)\nEOF\n",
      "cat <<$(cat /etc/passwd)\nbody\n$(cat /etc/passwd)\n",
    ])("keeps non-file text excluded in %j", async (command) => {
      await expect(extractBashPathCandidates(command, CWD)).resolves.toEqual(
        [],
      );
    });

    it("keeps plausibility filtering for inner file operands", async () => {
      await expect(
        extractBashPathCandidates(
          'echo "$(cat /missing-directory/file)"',
          CWD,
          { pathExists: () => false },
        ),
      ).resolves.toEqual([]);
    });
  });

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
      expect(
        await extractBashPathCandidates("echo foo >& /tmp/out", CWD),
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
    // command that continues after it. Relies on @aliou/sh 0.3.3 accepting
    // operator continuations (aliou/sh#24).
    it("ignores comment text after an operator, keeping the continuation", async () => {
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

  describe("when a command runs on a remote host", () => {
    it("does not treat ssh remote argv as local paths", async () => {
      expect(
        await extractBashPathCandidates(
          "ssh -i ~/.ssh/id user@host 'cat /etc/passwd'",
          CWD,
        ),
      ).toEqual([]);
    });

    it("does not surface argv kubectl passes to the pod command", async () => {
      const result = await extractBashPathCandidates(
        "kubectl exec -it pod/one -- ls -l /app",
        CWD,
      );
      // The in-pod path is dropped; the resource name stays as an
      // in-workspace candidate, which path-access allows silently.
      expect(result).not.toContain("/app");
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
