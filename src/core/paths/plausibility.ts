import { basename, dirname } from "node:path";

/**
 * Command-agnostic filters that keep non-path argv tokens from being reported
 * as filesystem access.
 *
 * Background: bash path extraction treats any token containing a separator as
 * a path candidate. Many CLIs use slash-bearing identifiers that are not paths
 * (`ctx7 docs /websites/apisix`, `go test ./...`, `docker run -v /a:/b`,
 * `git clone git@host:owner/repo.git`). The previous fix for each of these was
 * another hardcoded per-command classifier, which does not scale: the set of
 * CLIs is unbounded.
 *
 * These filters key on token shape and filesystem state instead of command
 * identity, so they cover CLIs nobody has enumerated.
 *
 * Safety model:
 *  - Only outside-workspace candidates are filtered. In-workspace candidates
 *    are always allowed by `checkPathAccess`, so noise there is harmless.
 *  - Never applied to `forcePath` tokens (redirect targets, `-o`/`-f` values).
 *  - Never applied to commands that create missing parent directories.
 */

/** `https://…`, `file://…`, `s3://…`. */
const URL_SCHEME = /^[a-z][a-z0-9+.-]*:\/\//i;

/** `user@host:/etc/passwd`, `git@github.com:owner/repo.git` — remote, not local. */
const REMOTE_TARGET = /^[A-Za-z0-9._-]+@[A-Za-z0-9._-]+:/;

/** `$VAR`, `${VAR}`, `$(cmd)`, `$((expr))`, `` `cmd` ``. */
const SHELL_EXPANSION = /\$[A-Za-z_{(]|`/;

/** Go package wildcard: `./...`, `./pkg/...`, `github.com/user/repo/...`. */
const WILDCARD_SEGMENT = /(?:^|\/)\.\.\.(?:\/|$)/;

/**
 * True when the token's shape rules it out as a local filesystem path,
 * regardless of which command it was passed to.
 *
 * Every pattern here must be one that cannot occur in a legal path, because
 * rejection happens before any filesystem check. Shapes that merely *usually*
 * mean "not a path" — such as a `docker run -v /src:/dst` volume spec — are
 * deliberately absent: `isImplausibleLocalPath` already drops them (the parent
 * `/src:` does not exist) without risking a real file that contains a colon.
 */
export function hasNonPathShape(token: string): boolean {
  return (
    URL_SCHEME.test(token) ||
    REMOTE_TARGET.test(token) ||
    WILDCARD_SEGMENT.test(token)
  );
}

/**
 * Commands that create missing parent directories, so a not-yet-existing
 * destination is a real access rather than a misparsed identifier.
 *
 * Defined by capability, not by convenience. Adding an entry weakens
 * `isImplausibleLocalPath` for that command only; omitting one that should be
 * here means a write to a brand-new outside-workspace root is not surfaced.
 */
const PATH_CREATING_COMMANDS = new Set([
  "7z",
  "cp",
  "curl", // --create-dirs
  "dd",
  "git",
  "install",
  "ln",
  "mkdir",
  "mktemp",
  "mv",
  "rsync",
  "tar",
  "tee",
  "touch",
  "unzip",
  "wget",
  "zip",
]);

/**
 * Prefixes that run another command. Only used to find the effective command
 * name for `createsPaths`, never to classify arguments, so an unlisted wrapper
 * cannot re-introduce the identifier false positives this module exists to
 * remove. It can only cause a missed candidate behind that wrapper.
 */
const TRANSPARENT_PREFIXES = new Set([
  "command",
  "doas",
  "env",
  "nice",
  "nohup",
  "shx",
  "sudo",
  "time",
  "xargs",
]);

/** Package runners: the next token is a package, optionally version-pinned. */
const PACKAGE_RUNNERS = new Set(["bunx", "npx", "pipx", "uvx"]);
const SUBCOMMAND_RUNNERS: Record<string, string[]> = {
  pnpm: ["dlx", "exec"],
  yarn: ["dlx", "exec"],
  npm: ["exec"],
};

function normalize(command: string): string {
  return basename(command).toLowerCase();
}

/**
 * Resolve the command that actually runs, looking through wrappers.
 *
 * `sudo mkdir -p /exfil/data` and `npx mkdir -p /exfil/data` must be seen as
 * `mkdir`, or existence suppression would hide a directory the command itself
 * creates.
 */
export function effectiveCommandName(
  commandName: string | undefined,
  args: string[] = [],
): string | undefined {
  if (!commandName) return undefined;
  let cmd = normalize(commandName);
  let rest = args;

  for (let hops = 0; hops < 3; hops++) {
    let next: string | undefined;

    if (TRANSPARENT_PREFIXES.has(cmd)) {
      // Skip flags and `NAME=value` assignments (`env FOO=1 mkdir /x`).
      const index = rest.findIndex(
        (arg) => !arg.startsWith("-") && !/^[A-Za-z_][A-Za-z0-9_]*=/.test(arg),
      );
      if (index === -1) return cmd;
      next = rest[index];
      rest = rest.slice(index + 1);
    } else if (PACKAGE_RUNNERS.has(cmd)) {
      const index = rest.findIndex((arg) => !arg.startsWith("-"));
      if (index === -1) return cmd;
      next = rest[index];
      rest = rest.slice(index + 1);
    } else if (SUBCOMMAND_RUNNERS[cmd]) {
      const index = rest.findIndex((arg) =>
        SUBCOMMAND_RUNNERS[cmd]?.includes(arg),
      );
      if (index === -1) return cmd;
      next = rest[index + 1];
      rest = rest.slice(index + 2);
    } else {
      return cmd;
    }

    if (!next) return cmd;
    // Strip a version pin: `ctx7@latest`, `cowsay@1.2.3`.
    cmd = normalize(next.replace(/@[^@/]*$/, "") || next);
  }

  return cmd;
}

/**
 * True when the token contains an unexpanded shell reference.
 *
 * Such a token cannot be resolved to a real path, so the filesystem says
 * nothing about it: `cat "$(pwd)/../../etc/shadow"` resolves to a directory
 * that does not exist while the command still reads a real file. Following the
 * same stance as the `onlyIfExists` fix, an unresolvable reference is treated
 * as suspicious rather than proven absent.
 */
export function hasShellExpansion(token: string): boolean {
  return SHELL_EXPANSION.test(token);
}

export function createsPaths(commandName: string | undefined): boolean {
  if (!commandName) return false;
  return PATH_CREATING_COMMANDS.has(normalize(commandName));
}

/**
 * True when a path-creating command appears anywhere in this command's words.
 *
 * `effectiveCommandName` cannot see through wrapper options that take a value
 * (`env -C /tmp mkdir \u2026`, `xargs -I {} mkdir \u2026`, `nice -n 5 mkdir \u2026`), and
 * enumerating every wrapper's option grammar is the treadmill this module
 * exists to avoid. Scanning instead fails in the safe direction: a false hit
 * only disables suppression for that command, which costs an extra candidate.
 *
 * Only separator-free words count, so a path argument whose basename happens
 * to be a command name (`ctx7 docs /websites/tar`) cannot trigger it.
 */
/**
 * Names too common as subcommands to scan for (`ctx7 skills install \u2026`,
 * `npm install`, `brew install`). They still count when they are the resolved
 * command, so `install -D x /exfil/y` and `sudo install \u2026` are unaffected;
 * only the wrapper-option case (`env -C /tmp install \u2026`) is missed.
 */
const NOT_SCANNED = new Set(["install"]);

export function commandCreatesPaths(
  commandName: string | undefined,
  args: string[] = [],
): boolean {
  if (createsPaths(effectiveCommandName(commandName, args))) return true;

  return args.some(
    (arg) =>
      !arg.startsWith("-") &&
      !arg.includes("/") &&
      !arg.includes("\\") &&
      !/^[A-Za-z_][A-Za-z0-9_]*=/.test(arg) &&
      !NOT_SCANNED.has(arg.toLowerCase()) &&
      PATH_CREATING_COMMANDS.has(arg.toLowerCase()),
  );
}

/**
 * True when an absolute path is unlikely to be a real filesystem target
 * because neither it nor its parent directory exists.
 *
 * Reads that matter target files that already exist (`/etc/passwd`,
 * `~/.ssh/id_rsa`), so this never suppresses them. Writes to a missing
 * directory fail unless the command creates parents — see `createsPaths`.
 *
 * It is also evasion-resistant in the obvious direction: creating the root
 * first (`mkdir -p /exfil`, itself never suppressed) makes the parent exist,
 * which re-enables reporting for every later access under it.
 */
export function isImplausibleLocalPath(
  absPath: string,
  pathExists: (path: string) => boolean,
): boolean {
  if (pathExists(absPath)) return false;

  const parent = dirname(absPath);
  if (parent === absPath) return false; // the filesystem root itself

  // A top-level entry (`/exfil`, `C:\exfil`) is always plausible: its parent
  // is the root, which always exists. This keeps `rm -rf /nope` and
  // `mkdir /exfil` visible regardless of the create-capable command list.
  if (dirname(parent) === parent) return false;

  return !pathExists(parent);
}
