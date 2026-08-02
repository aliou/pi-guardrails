import { homedir } from "node:os";
import { vol } from "memfs";
import { beforeEach, describe, expect, it } from "vitest";
import { extractBashPathCandidates } from "./bash-paths";

/**
 * Shape/plausibility filtering for bash path candidates.
 *
 * These cases are all currently reported as outside-workspace paths by the
 * hardcoded per-command classifier, which only knows about awk/sed/grep/find/
 * jq/interpreters/go/cut/sort/tr and returns every token for anything else.
 *
 * The filter under test is command-agnostic:
 *  - shape rejection (URL scheme, remote target, volume spec, `...` segment)
 *  - existence suppression for outside-workspace tokens whose path AND parent
 *    directory do not exist
 *
 * Only outside-workspace candidates are filtered. In-workspace candidates are
 * always allowed by `checkPathAccess`, so noise there cannot produce a prompt.
 */

const CWD = "/work/project";
const HOME = homedir();

/** Nothing outside this tree exists. */
beforeEach(() => {
  vol.fromJSON({
    "/etc/passwd": "",
    "/tmp/.keep": "",
    "/var/log/system.log": "",
    "/work/project/secrets.txt": "",
    "/work/project/archive.tar": "",
    "/work/project/archive.zip": "",
    "/work/project/report.txt": "",
    [`${HOME}/.ssh/id_rsa`]: "",
    [`${HOME}/.aws/.keep`]: "",
  });
});

const extract = (command: string) => extractBashPathCandidates(command, CWD);

describe("outside-workspace plausibility filter", () => {
  describe("identifier CLIs (issue #49, PRs #51/#85)", () => {
    it.each([
      ['ctx7 docs /drizzle-team/drizzle-orm-docs "how do I query"', "direct"],
      ['npx ctx7@latest docs /websites/apisix "routes"', "npx"],
      ['pnpm dlx ctx7 docs /websites/apisix "routes"', "pnpm dlx"],
      ['bunx ctx7 docs /websites/apisix "routes"', "bunx"],
      ['pnpm exec ctx7 docs /websites/apisix "routes"', "pnpm exec"],
      ['yarn dlx ctx7 docs /websites/apisix "routes"', "yarn dlx"],
      ['uvx ctx7 docs /websites/apisix "routes"', "uvx"],
      ["ctx7 skills install /aliou/pi-guardrails", "skills install"],
    ])("ignores the library id in %s (%s)", async (command) => {
      expect(await extract(command)).toEqual([]);
    });

    it("ignores library ids inside a nested shell program", async () => {
      expect(
        await extract(`bash -c 'npx ctx7 docs /websites/apisix "routes"'`),
      ).toEqual([]);
    });

    it("still extracts real paths passed to an unknown runner", async () => {
      expect(await extract("npx some-cli /etc/passwd")).toEqual([
        "/etc/passwd",
      ]);
    });
  });

  describe("go package patterns (issue #39) without a go classifier", () => {
    it.each([
      "go test ./...",
      "go build ./...",
      "go vet ./pkg/...",
      "go list github.com/user/repo/...",
    ])("ignores the package pattern in %s", async (command) => {
      expect(await extract(command)).toEqual([]);
    });

    it("keeps a real directory passed to go -C", async () => {
      // `go -C /tmp test ./...` really does chdir to /tmp: that is a genuine
      // outside-workspace access and should still be surfaced.
      expect(await extract("go -C /tmp test ./...")).toEqual(["/tmp"]);
    });
  });

  describe("other identifier-shaped arguments", () => {
    it("ignores owner/repo slugs", async () => {
      expect(
        await extract("gh pr view 12 --repo /aliou/pi-guardrails"),
      ).toEqual([]);
    });

    it("ignores docker volume specs", async () => {
      // Not a shape rule: `/tmp:` simply does not exist.
      expect(await extract("docker run -v /tmp:/tmp alpine")).toEqual([]);
    });

    it("ignores URLs", async () => {
      expect(await extract("curl https://example.com/a/b")).toEqual([]);
    });

    it("ignores scp/rsync remote targets", async () => {
      expect(await extract("scp report.txt deploy@host:/etc/passwd")).toEqual(
        [],
      );
    });

    it("ignores git ssh remotes", async () => {
      expect(
        await extract("git clone git@github.com:aliou/pi-guardrails.git"),
      ).toEqual([]);
    });
  });

  describe("unchanged behaviour for known regressions", () => {
    it("still surfaces the interpreter wrapper bypass (issue #76)", async () => {
      expect(
        await extract(
          `powershell -Command "Get-Content -Path '/etc/passwd' -TotalCount 1"`,
        ),
      ).toEqual(["/etc/passwd"]);
    });

    it("does not add outside-workspace candidates for find/xargs pipelines (issue #79)", async () => {
      // The lone `\` and the escaped-pipe grep pattern resolve inside the
      // workspace on POSIX. The Windows drive-root case in #79 is a
      // tokenizer bug, fixed by the @aliou/sh bump in PR #82, not here.
      const result = await extract(
        'find ./src -type f \\( -name "*.cs" \\) | xargs grep -l "a\\|b"',
      );

      expect(result.filter((path) => !path.startsWith(`${CWD}/`))).toEqual([]);
      expect(result).toContain(`${CWD}/src`);
    });

    it("leaves unexpanded policy targets in the workspace alone (PR #84)", async () => {
      // `$SC/.env` stays a candidate so the policies feature can still judge
      // it; plausibility filtering never runs on in-workspace tokens.
      expect(await extract('head "$SC/.env"')).toEqual([`${CWD}/$SC/.env`]);
    });
  });

  describe("in-workspace noise is left alone", () => {
    // These tokens are not paths either, but they resolve inside the
    // workspace, where `checkPathAccess` always returns allow. Filtering them
    // would buy nothing and would cost a stat call per token.
    it.each([
      ["kubectl logs pod/api-server-1", ["/work/project/pod/api-server-1"]],
      [
        "gh pr view 12 --repo aliou/pi-guardrails",
        ["/work/project/aliou/pi-guardrails"],
      ],
    ])("%s", async (command, expected) => {
      expect(await extract(command)).toEqual(expected);
    });
  });

  describe("real outside-workspace access is still surfaced", () => {
    it.each([
      ["cat /etc/passwd", ["/etc/passwd"]],
      ["cat ~/.ssh/id_rsa", [`${HOME}/.ssh/id_rsa`]],
      ["cat ~/.aws/credentials", [`${HOME}/.aws/credentials`]],
      ["tail -f /var/log/system.log", ["/var/log/system.log"]],
      ["ls /tmp", ["/tmp"]],
    ])("%s", async (command, expected) => {
      expect(await extract(command)).toEqual(expected);
    });

    it("surfaces reads hidden in an interpreter program", async () => {
      expect(await extract(`python3 -c 'open("/etc/passwd").read()'`)).toEqual([
        "/etc/passwd",
      ]);
    });

    it("surfaces reads hidden in a nested shell program", async () => {
      expect(await extract(`sh -c 'cat /etc/passwd'`)).toEqual(["/etc/passwd"]);
    });
  });

  describe("existence suppression cannot be used to escape", () => {
    it("never suppresses a redirect target", async () => {
      // /exfil does not exist, but the redirect creates the file.
      expect(await extract("cat secrets.txt > /exfil/dump.txt")).toEqual([
        "/exfil/dump.txt",
      ]);
    });

    it.each([
      "mkdir -p /exfil/data",
      "rsync -a ./src /exfil/data",
      "tar -x -C /exfil/data -f archive.tar",
      "git clone https://example.com/r.git /exfil/data",
      "unzip archive.zip -d /exfil/data",
    ])("never suppresses a path-creating command: %s", async (command) => {
      const result = await extract(command);
      expect(result).toContain("/exfil/data");
    });

    it("never suppresses an install -D destination", async () => {
      expect(
        await extract("install -D secrets.txt /exfil/data/secrets.txt"),
      ).toContain("/exfil/data/secrets.txt");
    });

    it("never suppresses paths from an interpreter program", async () => {
      // The program can call os.makedirs itself, so a missing parent proves
      // nothing about whether the write will land.
      expect(
        await extract(
          `python3 -c 'import os; os.makedirs("/exfil/sub"); open("/exfil/sub/data", "w")'`,
        ),
      ).toContain("/exfil/sub/data");
    });

    it("never suppresses curl --create-dirs destinations", async () => {
      expect(
        await extract(
          "curl --create-dirs -o /exfil/sub/f https://example.com/f",
        ),
      ).toEqual(["/exfil/sub/f"]);
    });

    it.each([
      "sudo mkdir -p /exfil/data",
      "env mkdir -p /exfil/data",
      "xargs mkdir -p /exfil/data",
      "npx mkdir -p /exfil/data",
      "pnpm dlx shx mkdir -p /exfil/data",
      "sudo /bin/mkdir -p /exfil/data",
      // Wrapper options that take a value defeat positional unwrapping, so the
      // scan has to look at every word.
      "env -C /tmp mkdir -p /exfil/data",
      "env -u FOO mkdir -p /exfil/data",
      "xargs -I {} mkdir -p /exfil/data",
      "nice -n 5 mkdir -p /exfil/data",
      "strace mkdir -p /exfil/data",
      "pnpm exec --filter=foo mkdir -p /exfil/data",
    ])("looks through wrappers to find the real command: %s", async (cmd) => {
      expect(await extract(cmd)).toContain("/exfil/data");
    });

    it("does not treat a path basename as a path-creating command", async () => {
      // `/websites/tar` must not disable suppression just because its
      // basename matches an entry in the path-creating list.
      expect(await extract("ctx7 docs /websites/tar")).toEqual([]);
    });

    it("still suppresses identifiers behind the same wrappers", async () => {
      // Wrapper unwrapping only feeds the path-creating lookup; it must not
      // resurrect the ctx7 false positive.
      expect(
        await extract("sudo npx ctx7@latest docs /websites/apisix"),
      ).toEqual([]);
    });

    it.each([
      // A `$(...)` that expands to a real location resolves, before
      // expansion, to a directory that does not exist. The filesystem cannot
      // rule the token out, so it must not be suppressed. Cf. the
      // `onlyIfExists` bypass in PR #84.
      'cat "$(pwd)/../../etc/shadow"',
      // biome-ignore lint/suspicious/noTemplateCurlyInString: shell syntax
      'cat "${OUTSIDE}/../../../etc/shadow"',
      "cat $SECRETS/../../../etc/shadow",
      "cat `pwd`/../../etc/shadow",
    ])("never suppresses an unexpanded shell reference: %s", async (cmd) => {
      expect(await extract(cmd)).not.toEqual([]);
    });

    it("surfaces a colon-bearing path that really exists", async () => {
      vol.fromJSON({ "/tmp/odd:/data": "" });
      expect(await extract("cat /tmp/odd:/data")).toEqual(["/tmp/odd:/data"]);
    });

    it("never suppresses a path-creating command nested in a shell", async () => {
      expect(await extract(`bash -c 'mkdir -p /exfil/data'`)).toContain(
        "/exfil/data",
      );
    });

    it("surfaces a write once the parent exists", async () => {
      // The two-step evasion (create the root, then write into it) fails:
      // /tmp exists, so nothing is suppressed.
      expect(await extract("cp secrets.txt /tmp/exfil.txt")).toEqual([
        "/tmp/exfil.txt",
      ]);
    });
  });
});
