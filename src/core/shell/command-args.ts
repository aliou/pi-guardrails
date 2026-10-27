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
 *  4. Commands with no file operands at all (`echo`, `printf`, `tr`) — POSIX
 *     defines their grammars as pure text, so no operand can be a file and a
 *     protected name passed as data cannot read as file access.
 *  5. Remote command runners — argv that names paths on *another* machine
 *     must not read as local filesystem access. Both rules lean on the
 *     command's own documented contract instead of option tables we would
 *     have to track: for `ssh`, anything from the destination on runs
 *     remotely and option values stay unparsed (identity files named by `-i`
 *     are read locally but shelve with the destination by design); for
 *     `kubectl`, argv after `--` belongs to the pod's command.
 *  6. Search tools (`grep`, `egrep`, `fgrep`, `rg`, `git grep`) — the first
 *     non-option positional is the search pattern, never a path. `git log -L`
 *     and `git blame -L` line ranges are patterns too; only the file after
 *     the range's last `:` is a path.
 *
 * Everything else returns every token and is filtered downstream by shape and
 * plausibility checks in `extractBashPathCandidates`. Commands that merely
 * take identifier-shaped or pattern-shaped arguments (awk, sed, jq, go,
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
  if (SEARCH_COMMANDS.has(cmd)) return classifySearchArgs(args);
  if (cmd === "git") return classifyGitArgs(args);
  if (cmd === "cut")
    return skipOptionValues(args, new Set(["-d", "--delimiter"]));
  if (cmd === "sort")
    return skipOptionValues(args, new Set(["-t", "--field-separator"]));
  if (NO_FILE_OPERAND_COMMANDS.has(cmd)) return [];

  // Everything an ssh argv carries past its own options runs on the remote
  // host, and the options themselves are names, not local paths. Without an
  // ssh option table we cannot reliably locate `-i` identity files either,
  // so no ssh argv token is a reliably-local path and all of argv drops.
  if (cmd === "ssh") return [];

  // kubectl passes argv after `--` to the container command per its CLI
  // contract; those words are in-pod paths, not local filesystem access.
  if (cmd === "kubectl") {
    const tail = args.indexOf("--");
    return (tail === -1 ? args : args.slice(0, tail)).map((token) => ({
      token,
    }));
  }

  return args.map((token) => ({ token }));
}

/**
 * Commands whose grammar takes no file operands at all (POSIX: `echo
 * [ARGUMENT]…`, `printf FORMAT [ARGUMENT]…`, `tr STRING1 STRING2`). Every
 * non-option argument is pure text, so a token that names a protected file
 * is data, never file access. This set is closed — it follows the fixed
 * POSIX grammar of each utility, not CLI dialects we'd have to track.
 */
const NO_FILE_OPERAND_COMMANDS = new Set(["echo", "printf", "tr"]);

/** Whether a command's argv can never contain a file operand. */
export function takesNoFileOperands(command: string): boolean {
  return NO_FILE_OPERAND_COMMANDS.has(normalizeCommandName(command));
}

const SEARCH_COMMANDS = new Set(["grep", "egrep", "fgrep", "rg"]);

const SEARCH_PATTERN_OPTIONS = new Set(["--regexp", "--file"]);

const SEARCH_VALUE_OPTIONS = new Set([
  "--after-context",
  "--before-context",
  "--context",
  "--max-count",
  "--max-depth",
  "--threads",
  "--glob",
  "--type",
  "--type-not",
]);

const SEARCH_VALUE_LETTERS = new Set([
  "e",
  "f",
  "A",
  "B",
  "C",
  "m",
  "g",
  "t",
  "T",
]);

function classifySearchArgs(args: string[]): ClassifiedArg[] {
  const out: ClassifiedArg[] = [];
  let patternGiven = false;
  let optionsEnded = false;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i] as string;
    if (!optionsEnded && arg === "--") {
      optionsEnded = true;
      continue;
    }
    if (!optionsEnded && isOption(arg)) {
      if (arg.startsWith("--")) {
        const eq = arg.indexOf("=");
        const name = eq === -1 ? arg : arg.slice(0, eq);
        if (SEARCH_PATTERN_OPTIONS.has(name)) {
          patternGiven = true;
          if (name === "--file") {
            const file = eq === -1 ? args[++i] : arg.slice(eq + 1);
            if (file) out.push({ token: file });
          } else if (eq === -1) {
            i++;
          }
        } else if (SEARCH_VALUE_OPTIONS.has(name) && eq === -1) {
          i++;
        }
        continue;
      }
      const letters = arg.slice(1);
      for (let j = 0; j < letters.length; j++) {
        const letter = letters[j];
        if (!SEARCH_VALUE_LETTERS.has(letter)) continue;
        const value = letters.slice(j + 1);
        if (letter === "e" || letter === "f") {
          patternGiven = true;
          if (letter === "f") {
            const file = value || args[++i];
            if (file) out.push({ token: file });
          } else if (!value) {
            i++;
          }
        } else if (!value) {
          i++;
        }
        break;
      }
      continue;
    }
    if (!patternGiven) {
      patternGiven = true;
      continue;
    }
    out.push({ token: arg });
  }
  return out;
}

const GIT_GLOBAL_VALUE_OPTIONS = new Set([
  "-C",
  "-c",
  "--git-dir",
  "--work-tree",
  "--namespace",
  "--config-env",
]);

function classifyGitArgs(args: string[]): ClassifiedArg[] {
  let sub = 0;
  while (sub < args.length && isOption(args[sub] as string)) {
    if (GIT_GLOBAL_VALUE_OPTIONS.has(args[sub] as string)) sub++;
    sub++;
  }
  const head = args.slice(0, sub + 1).map((token) => ({ token }));
  const rest = args.slice(sub + 1);
  const subcommand = args[sub];
  if (subcommand === "grep") return [...head, ...classifySearchArgs(rest)];
  if (subcommand === "log" || subcommand === "blame") {
    return [...head, ...classifyLineRangeArgs(rest, subcommand === "log")];
  }
  return [...head, ...rest.map((token) => ({ token }))];
}

function classifyLineRangeArgs(
  args: string[],
  rangeHasFile: boolean,
): ClassifiedArg[] {
  const out: ClassifiedArg[] = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i] as string;
    if (arg === "--") {
      out.push(...args.slice(i + 1).map((token) => ({ token })));
      break;
    }
    if (!arg.startsWith("-L")) {
      out.push({ token: arg });
      continue;
    }
    const range = arg === "-L" ? args[++i] : arg.slice(2);
    const colon = range?.lastIndexOf(":") ?? -1;
    if (rangeHasFile && range !== undefined && colon !== -1) {
      out.push({ token: range.slice(colon + 1) });
    }
  }
  return out;
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
  bareCodeTokens: boolean;
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
      bareCodeTokens: true,
    };
  }
  if (SHELL_INTERPRETERS.has(cmd)) {
    return {
      codeFlags: new Set(["-c"]),
      fileFlags: new Set(),
      skipFlags: new Set(),
      shellFamily: true,
      caseInsensitive: false,
      bareCodeTokens: false,
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
    bareCodeTokens: false,
  };
}

/**
 * Tokenize an embedded program string and return path-like tokens.
 *
 * Interpreters (python -c, powershell -Command, node -e) hide filesystem
 * access inside a program string that the outer shell parser treats as a
 * single argument. Scanning the program for quoted string literals (and, for
 * PowerShell, unquoted tokens) lets path-access policies gate the embedded
 * access.
 */
const CODE_TOKEN_REGEX =
  /"([^"]+)"|'([^']+)'|`([^`]+)`|([^\s"'`<>|;&(){}[\]]+)/g;

function extractPathsFromCode(
  code: string,
  bareTokens: boolean,
): ClassifiedArg[] {
  const out: ClassifiedArg[] = [];
  for (const match of code.matchAll(CODE_TOKEN_REGEX)) {
    const quoted = match[1] ?? match[2] ?? match[3];
    const token = quoted ?? (bareTokens ? match[4] : undefined) ?? "";
    if (!token || token.startsWith("-")) continue;
    if (!maybePathLike(token)) continue;
    if (!quoted) {
      out.push({ token, programText: true });
      continue;
    }
    const before = code.slice(0, match.index);
    const after = code.slice(match.index + match[0].length);
    if (before.trimEnd().endsWith("+") || after.trimStart().startsWith("+")) {
      continue;
    }
    if (before.endsWith("[")) {
      const prev = before.at(-2);
      if (prev && /[A-Za-z0-9_$)\]]/.test(prev)) continue;
    }
    out.push({ token, programText: true });
  }
  return out;
}

function classifyInterpreterArgs(cmd: string, args: string[]): ClassifiedArg[] {
  const {
    codeFlags,
    fileFlags,
    skipFlags,
    shellFamily,
    caseInsensitive,
    bareCodeTokens,
  } = interpreterFlags(cmd);
  const out: ClassifiedArg[] = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i] as string;
    const flag = caseInsensitive ? arg.toLowerCase() : arg;
    if (codeFlags.has(flag)) {
      const code = args[++i];
      if (code) {
        if (shellFamily) out.push({ token: code, recurseShell: true });
        else out.push(...extractPathsFromCode(code, bareCodeTokens));
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
