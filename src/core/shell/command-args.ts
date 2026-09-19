import { basename } from "node:path";
import { maybePathLike } from "../paths/path";

export type ClassifiedArg = {
  token: string;
  forcePath?: boolean;
  /** Token came from interpreter program text. */
  programText?: boolean;
  /** Token is an embedded shell program; re-parse and recurse. */
  recurseShell?: boolean;
};

function normalizeCommandName(command: string): string {
  return basename(command).toLowerCase();
}

function isOption(arg: string): boolean {
  return arg.startsWith("-") && arg !== "-" && arg !== "--";
}

/**
 * Classify a command's argv into path candidates.
 *
 * Only four categories are special-cased, and each exists for a structural
 * reason that no shape or filesystem heuristic can recover:
 *
 *  0. `xargs` \u2014 it runs a nested command, so its argv has to be re-classified
 *     as that command's argv.
 *  1. Interpreters — the program text is an opaque argv token that hides real
 *     filesystem access (`python3 -c 'open("/etc/passwd")'`). Security
 *     critical: this is the defense for the wrapper bypass in issue #76.
 *  2. `find` — its expression grammar mixes roots, patterns, and shell
 *     punctuation (`\`, `(`, `)`), and a stray `\` resolves to the drive root
 *     on Windows (issue #79).
 *  3. Delimiter arguments (`cut -d /`, `sort -t /`, `tr / :`) — the value is
 *     literally `/`, which exists, so no existence check can reject it.
 *
 * Everything else returns every token and is filtered downstream by shape and
 * plausibility checks in `extractBashPathCandidates`. Commands that merely
 * take identifier-shaped or pattern-shaped arguments (awk, sed, grep, jq, go,
 * ctx7, gh, docker, kubectl, …) deliberately have no entry here: enumerating
 * them does not terminate.
 */
export function classifyCommandArgs(
  command: string,
  args: string[],
): ClassifiedArg[] {
  const cmd = normalizeCommandName(command);

  // xargs appends piped args to a nested command. Find the wrapped command
  // (first non-flag token, skipping option values that are not paths) and
  // classify the remaining fixed args as that command's arguments.
  if (cmd === "xargs") return classifyXargsArgs(args);

  if (cmd === "find" || cmd === "gfind") return classifyFindArgs(args);
  if (isInterpreter(cmd)) {
    return classifyInterpreterArgs(cmd, args);
  }
  if (cmd === "cut")
    return skipOptionValues(args, new Set(["-d", "--delimiter"]));
  if (cmd === "sort")
    return skipOptionValues(args, new Set(["-t", "--field-separator"]));
  if (cmd === "tr") return [];
  if (cmd === "ssh") return classifySshArgs(args);
  if (cmd === "kubectl") return classifyKubectlArgs(args);
  if (isGrepLike(cmd)) return classifyGrepLikeArgs(cmd, args);
  if (TEXT_ONLY_COMMANDS.has(cmd)) return [];

  return args.map((token) => ({ token }));
}

function classifyFindArgs(args: string[]): ClassifiedArg[] {
  const out: ClassifiedArg[] = [];
  let inExpression = false;
  const patternOptions = new Set([
    "-name",
    "-iname",
    "-path",
    "-ipath",
    "-regex",
    "-iregex",
    "-wholename",
    "-iwholename",
  ]);
  for (let i = 0; i < args.length; i++) {
    const arg = args[i] as string;
    // Escaped parens `\(` `\)` arrive as lone `\` words after AST parsing;
    // treat them as expression operators, never as path roots. On Windows
    // resolve(cwd, "\\") is the drive root, which breaks boundary checks.
    if (arg === "\\" || arg === "(" || arg === ")" || arg === "!") {
      inExpression = true;
      continue;
    }
    if (!inExpression && !arg.startsWith("-")) {
      out.push({ token: arg });
      continue;
    }
    inExpression = true;
    if (patternOptions.has(arg)) i++;
  }
  return out;
}

/**
 * xargs runs a nested command with piped args appended. Skip leading xargs
 * options (values of -I/-J/-L/-n/-P/-s/-0 etc. are not paths), then classify
 * the rest as the wrapped command's arguments. Bare `xargs` defaults to echo;
 * `xargs -0 rm` style invocations classify as `rm`.
 */
function classifyXargsArgs(args: string[]): ClassifiedArg[] {
  const optionsWithValues = new Set([
    "-I",
    "-J",
    "-L",
    "-n",
    "-P",
    "-s",
    "-S",
    "-E",
  ]);
  for (let i = 0; i < args.length; i++) {
    const arg = args[i] as string;
    if (optionsWithValues.has(arg)) {
      i++;
      continue;
    }
    if (isOption(arg)) continue;
    return classifyCommandArgs(arg, args.slice(i + 1));
  }
  return [];
}

/**
 * ssh options whose value is a local file — still genuine local access.
 * Every other ssh option value is connection plumbing (ports, user names),
 * and its shape filtering is left to the caller.
 */
const SSH_FILE_FLAGS = new Set(["-i", "-F"]);

/**
 * ssh executes everything after the connection destination on a *remote*
 * host. Remote argv is filesystem access on another machine, which no local
 * shape or existence heuristic can distinguish from local access, so tokens
 * after the destination are dropped entirely (issue #105).
 */
/**
 * Commands whose non-option arguments are pure text, never file operands
 * (issue #107). Both are POSIX-defined command grammars with no file operands
 * at all — `printf FORMAT [ARGUMENT]`, `echo [ARGUMENT]…` — so no shape or
 * existence heuristic can rescue a protected name passed as data.
 */
const TEXT_ONLY_COMMANDS = new Set(["echo", "printf"]);

/**
 * Pattern-first search commands: `grep [OPTIONS] PATTERN [FILE…]` and
 * equivalents. The first non-option argument is the pattern, not a file
 * operand; with `-e`/`--regexp` no non-option argument is a pattern.
 *
 * File-operand arguments are still returned, so reading a protected file
 * through one of these stays blocked (issue #107).
 */
const GREP_LIKE_COMMANDS = new Set(["grep", "egrep", "fgrep", "rg"]);

/** Options that take a *pattern-ish* value, never a file operand. */
const GREP_VALUE_FLAGS = new Set([
  "-e",
  "--regexp",
  "-m",
  "--max-count",
  "-A",
  "--after-context",
  "-B",
  "--before-context",
  "-C",
  "--context",
  "--include",
  "--exclude",
  "--exclude-dir",
  "--label",
]);

/** Flags exclusive to ripgrep that take a pattern-ish, non-file value. */
const RG_VALUE_FLAGS = new Set([
  "-g",
  "--glob",
  "-t",
  "--type",
  "--type-add",
  "--type-clear",
  "-r",
  "--replace",
]);

/** Options whose value is a file containing patterns — a real file operand. */
const GREP_FILE_VALUE_FLAGS = new Set(["-f", "--file"]);

function isGrepLike(cmd: string): boolean {
  return GREP_LIKE_COMMANDS.has(cmd);
}

function classifyGrepLikeArgs(cmd: string, args: string[]): ClassifiedArg[] {
  const valueFlags = cmd === "rg" ? RG_VALUE_FLAGS : GREP_VALUE_FLAGS;
  const out: ClassifiedArg[] = [];
  let sawPatternFlag = false;
  const operands: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i] as string;
    if (isOption(arg)) {
      if (valueFlags.has(arg) || GREP_VALUE_FLAGS.has(arg)) {
        if (arg === "-e" || arg === "--regexp") sawPatternFlag = true;
        i++;
        continue;
      }
      if (GREP_FILE_VALUE_FLAGS.has(arg)) {
        // A pattern file is a genuine file read. It also means the patterns
        // come from the file, so every later non-option argument is a file
        // operand too.
        sawPatternFlag = true;
        if (args[i + 1] !== undefined)
          out.push({ token: args[++i] as string, forcePath: true });
        continue;
      }
      continue;
    }
    operands.push(arg);
  }
  // Without an explicit pattern flag the first non-option argument is the
  // pattern itself; with one, every non-option argument is a file operand.
  const skip = !sawPatternFlag && operands.length > 0 ? 1 : 0;
  for (const token of operands.slice(skip)) out.push({ token });
  return out;
}

function classifySshArgs(args: string[]): ClassifiedArg[] {
  const out: ClassifiedArg[] = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i] as string;
    if (isOption(arg)) {
      if (SSH_FILE_FLAGS.has(arg) && args[i + 1] !== undefined) {
        out.push({ token: args[++i] as string });
      }
      continue;
    }
    // First non-option token is the destination; everything after it is
    // a remote command.
    break;
  }
  return out;
}

/** kubectl options that may appear before the subcommand and take a value. */
const KUBECTL_GLOBAL_VALUE_FLAGS = new Set([
  "-n",
  "-c",
  "-s",
  "--context",
  "--namespace",
  "--cluster",
  "--user",
  "--kubeconfig",
  "--server",
]);

/**
 * kubectl subcommands that operate entirely on remote containers or hosts —
 * nothing in their argv addresses the local filesystem (issue #105).
 */
const KUBECTL_REMOTE_SUBCOMMANDS = new Set(["exec", "attach", "debug"]);

/**
 * kubectl's remote-subcommand argv runs in a container: it is not local
 * filesystem access and no shape heuristic can recover that — it is an
 * execution-context property. Drop those subtrees entirely; redirects around
 * them (e.g. `kubectl exec … > /tmp/out`) are still extracted by the caller.
 */
function classifyKubectlArgs(args: string[]): ClassifiedArg[] {
  for (let i = 0; i < args.length; i++) {
    const arg = args[i] as string;
    if (isOption(arg)) {
      if (KUBECTL_GLOBAL_VALUE_FLAGS.has(arg)) i++;
      continue;
    }
    if (KUBECTL_REMOTE_SUBCOMMANDS.has(arg)) return [];
    // Any other subcommand: fall through to generic handling.
    break;
  }
  return args.map((token) => ({ token }));
}

type InterpreterFlags = {
  /** Flags whose value is an embedded program; paths are extracted from it. */
  codeFlags: Set<string>;
  /** Flags whose value is a script file path. */
  fileFlags: Set<string>;
  /** Flags whose value is non-path data and should be skipped. */
  skipFlags: Set<string>;
  /** Code-flag values are shell programs; re-parse and recurse. */
  shellFamily: boolean;
  /** Match flags case-insensitively (PowerShell parameters). */
  caseInsensitive: boolean;
};

/** Shell-family interpreters whose -c value is itself a shell program. */
const SHELL_INTERPRETERS = new Set([
  "bash",
  "sh",
  "zsh",
  "dash",
  "ksh",
  "mksh",
  "ash",
]);

/** Non-shell interpreters that take inline code flags. */
const CODE_INTERPRETERS = new Set([
  "python",
  "python2",
  "python3",
  "node",
  "ruby",
  "perl",
  "php",
  "powershell",
  "pwsh",
  "lua",
  "lua5.1",
  "lua5.2",
  "lua5.3",
  "lua5.4",
  "rscript",
  "oscript",
  "osascript",
]);

function isInterpreter(cmd: string): boolean {
  return SHELL_INTERPRETERS.has(cmd) || CODE_INTERPRETERS.has(cmd);
}

/**
 * True when the command runs an arbitrary program supplied on the command
 * line. Such a program can create directories before writing to them, so its
 * extracted paths must never be existence-suppressed.
 */
export function isInterpreterCommand(command: string): boolean {
  return isInterpreter(normalizeCommandName(command));
}

function interpreterFlags(cmd: string): InterpreterFlags {
  if (cmd === "powershell" || cmd === "pwsh") {
    // PowerShell parameters are case-insensitive and have documented
    // short aliases: -c/-ca for -Command, -f/-fi for -File, -e/-ec for
    // -EncodedCommand.
    return {
      codeFlags: new Set(["-command", "-c", "-ca"]),
      fileFlags: new Set(["-file", "-f", "-fi"]),
      skipFlags: new Set(["-encodedcommand", "-e", "-ec"]),
      shellFamily: false,
      caseInsensitive: true,
    };
  }
  if (SHELL_INTERPRETERS.has(cmd)) {
    return {
      codeFlags: new Set(["-c"]),
      fileFlags: new Set(),
      skipFlags: new Set(),
      shellFamily: true,
      caseInsensitive: false,
    };
  }
  const codeFlags =
    cmd === "python" || cmd.startsWith("python")
      ? new Set(["-c"])
      : cmd === "php"
        ? new Set(["-r"])
        : new Set(["-e"]);
  return {
    codeFlags,
    fileFlags: new Set(),
    skipFlags: new Set(),
    shellFamily: false,
    caseInsensitive: false,
  };
}

/**
 * Tokenize an embedded program string and return path-like tokens.
 *
 * Interpreters (python -c, powershell -Command, node -e) hide filesystem
 * access inside a program string that the outer shell parser treats as a
 * single argument. Scanning the program for quoted/whitespace-delimited
 * path-like tokens lets path-access policies gate the embedded access.
 */
const CODE_TOKEN_REGEX =
  /"([^"]+)"|'([^']+)'|`([^`]+)`|([^\s"'`<>|;&(){}[\]]+)/g;

/**
 * A URL in program text: either a full scheme (`https://…`) or
 * protocol-relative (`//…`). Path fragments carved out of these are string
 * data, not filesystem locations (issue #105).
 */
const URL_SPAN_REGEX = /(?:[a-z][a-z0-9+.-]*:)?\/\/[^\s'"`<>()\\]+/gi;

function extractPathsFromCode(code: string): ClassifiedArg[] {
  const out: ClassifiedArg[] = [];
  const urls = [...code.matchAll(URL_SPAN_REGEX)].map((m) => m[0]);
  for (const match of code.matchAll(CODE_TOKEN_REGEX)) {
    const token = match[1] ?? match[2] ?? match[3] ?? match[4] ?? "";
    if (!token || token.startsWith("-")) continue;
    if (!maybePathLike(token)) continue;
    // A leading-slash token that appears inside a URL literal in the same
    // program text is string data — the program treats it as a remote
    // location, not something it will open (issue #105).
    if (token.startsWith("/") && urls.some((url) => url.includes(token))) {
      continue;
    }
    out.push({ token, programText: true });
  }
  return out;
}

function classifyInterpreterArgs(cmd: string, args: string[]): ClassifiedArg[] {
  const { codeFlags, fileFlags, skipFlags, shellFamily, caseInsensitive } =
    interpreterFlags(cmd);
  const out: ClassifiedArg[] = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i] as string;
    const flag = caseInsensitive ? arg.toLowerCase() : arg;
    if (codeFlags.has(flag)) {
      const code = args[++i];
      if (code) {
        if (shellFamily) out.push({ token: code, recurseShell: true });
        else out.push(...extractPathsFromCode(code));
      }
      continue;
    }
    if (fileFlags.has(flag)) {
      if (args[i + 1])
        out.push({ token: args[++i] as string, forcePath: true });
      continue;
    }
    if (skipFlags.has(flag)) {
      i++;
      continue;
    }
    if (isOption(arg)) continue;
    out.push({ token: arg });
  }
  return out;
}

function skipOptionValues(
  args: string[],
  optionsWithValues: Set<string>,
): ClassifiedArg[] {
  const out: ClassifiedArg[] = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i] as string;
    if (optionsWithValues.has(arg)) {
      i++;
      continue;
    }
    out.push({ token: arg });
  }
  return out;
}
