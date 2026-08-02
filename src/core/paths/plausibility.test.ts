import { describe, expect, it } from "vitest";
import {
  commandCreatesPaths,
  createsPaths,
  effectiveCommandName,
  hasNonPathShape,
  hasShellExpansion,
  isImplausibleLocalPath,
} from "./plausibility";

describe("hasNonPathShape", () => {
  it.each([
    "https://example.com/a/b",
    "http://localhost:3000/api",
    "s3://bucket/key",
    "file://localhost/etc/passwd",
    "deploy@host:/etc/passwd",
    "git@github.com:aliou/pi-guardrails.git",
    "./...",
    "./pkg/...",
    "github.com/user/repo/...",
  ])("rejects %s", (token) => {
    expect(hasNonPathShape(token)).toBe(true);
  });

  it.each([
    "/etc/passwd",
    "~/.ssh/id_rsa",
    "./src/index.ts",
    "../sibling/file.txt",
    "/tmp/a:b",
    "/var/log/app.log",
    "C:\\Users\\me\\file.txt",
    "/websites/apisix_apache_apisix",
  ])("accepts %s as a possible path", (token) => {
    expect(hasNonPathShape(token)).toBe(false);
  });
});

describe("effectiveCommandName", () => {
  it.each([
    ["sudo", ["mkdir", "-p", "/x"], "mkdir"],
    ["env", ["FOO=1", "mkdir", "/x"], "mkdir"],
    ["xargs", ["mkdir", "-p"], "mkdir"],
    ["npx", ["mkdir", "-p", "/x"], "mkdir"],
    ["npx", ["ctx7@latest", "docs", "/websites/apisix"], "ctx7"],
    ["pnpm", ["dlx", "shx", "mkdir"], "mkdir"],
    ["yarn", ["dlx", "ctx7", "docs"], "ctx7"],
    ["sudo", ["npx", "ctx7@latest", "docs"], "ctx7"],
    ["mkdir", ["-p", "/x"], "mkdir"],
    ["/usr/bin/mkdir", ["-p", "/x"], "mkdir"],
    ["cat", ["/etc/passwd"], "cat"],
  ])("%s %j resolves to %s", (command, args, expected) => {
    expect(effectiveCommandName(command, args)).toBe(expected);
  });

  it("returns the wrapper when nothing follows it", () => {
    expect(effectiveCommandName("sudo", [])).toBe("sudo");
  });

  it("returns undefined for a missing command", () => {
    expect(effectiveCommandName(undefined)).toBeUndefined();
  });
});

describe("hasShellExpansion", () => {
  it.each([
    "$SC/.env",
    // biome-ignore lint/suspicious/noTemplateCurlyInString: shell syntax
    "${OUTSIDE}/key",
    "$(pwd)/../../etc/shadow",
    "$((1+1))/x",
    "`pwd`/../etc/shadow",
    "/tmp/$USER/data",
    // `$b` really is an expansion in bash, even mid-token.
    "/tmp/a$b",
  ])("detects %s", (token) => {
    expect(hasShellExpansion(token)).toBe(true);
  });

  it.each([
    "/etc/passwd",
    "~/.ssh/id_rsa",
    "./src/index.ts",
    "/tmp/a-b",
    "a$",
  ])("leaves %s alone", (token) => {
    expect(hasShellExpansion(token)).toBe(false);
  });
});

describe("createsPaths", () => {
  it.each([
    "mkdir",
    "install",
    "rsync",
    "tar",
    "git",
    "/usr/bin/mkdir",
    "MKDIR",
  ])("treats %s as path-creating", (command) => {
    expect(createsPaths(command)).toBe(true);
  });

  it.each([
    "cat",
    "ctx7",
    "go",
    "grep",
    undefined,
  ])("does not treat %s as path-creating", (command) => {
    expect(createsPaths(command)).toBe(false);
  });
});

describe("commandCreatesPaths", () => {
  it.each([
    ["env", ["-C", "/tmp", "mkdir", "-p", "/exfil/data"]],
    ["xargs", ["-I", "{}", "mkdir", "-p", "/exfil/data"]],
    ["nice", ["-n", "5", "mkdir", "/exfil/data"]],
    ["strace", ["mkdir", "-p", "/exfil/data"]],
    ["pnpm", ["exec", "--filter=foo", "mkdir", "/exfil/data"]],
    ["sudo", ["/bin/mkdir", "-p", "/exfil/data"]],
  ])("detects a path-creating command in %s %j", (command, args) => {
    expect(commandCreatesPaths(command, args)).toBe(true);
  });

  it.each([
    ["ctx7", ["docs", "/websites/apisix"]],
    // A path whose basename matches a command name must not count.
    ["ctx7", ["docs", "/websites/tar"]],
    ["gh", ["pr", "view", "12"]],
    ["cat", ["/etc/passwd"]],
  ])("does not fire for %s %j", (command, args) => {
    expect(commandCreatesPaths(command, args)).toBe(false);
  });
});

describe("isImplausibleLocalPath", () => {
  const exists = (set: string[]) => (path: string) => set.includes(path);

  it("accepts a path that exists", () => {
    expect(isImplausibleLocalPath("/etc/passwd", exists(["/etc/passwd"]))).toBe(
      false,
    );
  });

  it("accepts a missing file whose parent exists", () => {
    expect(isImplausibleLocalPath("/tmp/new.txt", exists(["/tmp"]))).toBe(
      false,
    );
  });

  it("rejects a missing path whose parent is also missing", () => {
    expect(isImplausibleLocalPath("/websites/apisix", exists(["/"]))).toBe(
      true,
    );
  });

  it("accepts a missing top-level entry, since the root always exists", () => {
    // `/exfil` itself is reported; only `/exfil/data` is suppressed. Keeping
    // top-level targets means `rm -rf /nope` is still surfaced.
    expect(isImplausibleLocalPath("/exfil", exists([]))).toBe(false);
  });

  it("never rejects the filesystem root", () => {
    expect(isImplausibleLocalPath("/", exists([]))).toBe(false);
  });
});
