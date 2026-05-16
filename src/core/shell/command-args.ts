import { basename } from "node:path";

export type ClassifiedArg = { token: string; forcePath?: boolean };

function normalizeCommandName(command: string): string {
  return basename(command).toLowerCase();
}

function isOption(arg: string): boolean {
  return arg.startsWith("-") && arg !== "-" && arg !== "--";
}

export function classifyCommandArgs(
  command: string,
  args: string[],
): ClassifiedArg[] {
  const cmd = normalizeCommandName(command);

  if (cmd === "awk" || cmd === "gawk" || cmd === "mawk" || cmd === "nawk") {
    return classifyAwkArgs(args);
  }
  if (cmd === "sed" || cmd === "gsed") return classifySedArgs(args);
  if (["grep", "egrep", "fgrep", "rg", "ripgrep", "ag", "ack"].includes(cmd)) {
    return classifyGrepLikeArgs(args);
  }
  if (cmd === "find" || cmd === "gfind") return classifyFindArgs(args);
  if (cmd === "jq" || cmd === "yq") return classifyFilterCommandArgs(args);
  if (
    ["python", "python2", "python3", "node", "ruby", "perl", "php"].includes(
      cmd,
    )
  ) {
    return classifyInterpreterArgs(cmd, args);
  }
  if (cmd === "go") return classifyGoArgs(args);
  if (cmd === "cut")
    return skipOptionValues(args, new Set(["-d", "--delimiter"]));
  if (cmd === "sort")
    return skipOptionValues(args, new Set(["-t", "--field-separator"]));
  if (cmd === "tr") return [];

  return args.map((token) => ({ token }));
}

function classifyAwkArgs(args: string[]): ClassifiedArg[] {
  const out: ClassifiedArg[] = [];
  let sawProgram = false;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i] as string;
    if (arg === "--") continue;
    if (arg === "-f") {
      if (args[i + 1]) out.push({ token: args[++i] as string });
      sawProgram = true;
      continue;
    }
    if (arg === "-v" || arg === "-F") {
      i++;
      continue;
    }
    if (arg.startsWith("-f") && arg.length > 2) {
      out.push({ token: arg.slice(2) });
      sawProgram = true;
      continue;
    }
    if (isOption(arg)) continue;
    if (!sawProgram) {
      sawProgram = true;
      continue;
    }
    out.push({ token: arg });
  }
  return out;
}

function classifySedArgs(args: string[]): ClassifiedArg[] {
  const out: ClassifiedArg[] = [];
  let hasExplicitScript = false;
  let skippedImplicitScript = false;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i] as string;
    if (arg === "-e" || arg === "--expression") {
      hasExplicitScript = true;
      i++;
      continue;
    }
    if (arg === "-f" || arg === "--file") {
      hasExplicitScript = true;
      if (args[i + 1]) out.push({ token: args[++i] as string });
      continue;
    }
    if (arg.startsWith("-e") && arg.length > 2) {
      hasExplicitScript = true;
      continue;
    }
    if (arg.startsWith("-f") && arg.length > 2) {
      hasExplicitScript = true;
      out.push({ token: arg.slice(2) });
      continue;
    }
    if (isOption(arg)) continue;
    if (!hasExplicitScript && !skippedImplicitScript) {
      skippedImplicitScript = true;
      continue;
    }
    out.push({ token: arg });
  }
  return out;
}

function classifyGrepLikeArgs(args: string[]): ClassifiedArg[] {
  const out: ClassifiedArg[] = [];
  let patternProvided = false;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i] as string;
    if (arg === "-e" || arg === "--regexp") {
      patternProvided = true;
      i++;
      continue;
    }
    if (arg === "-f" || arg === "--file") {
      patternProvided = true;
      if (args[i + 1]) out.push({ token: args[++i] as string });
      continue;
    }
    if (["-g", "--glob", "-t", "-T", "--type", "--type-not"].includes(arg)) {
      i++;
      continue;
    }
    if (arg.startsWith("-e") && arg.length > 2) {
      patternProvided = true;
      continue;
    }
    if (arg.startsWith("-f") && arg.length > 2) {
      patternProvided = true;
      out.push({ token: arg.slice(2) });
      continue;
    }
    if (isOption(arg)) continue;
    if (!patternProvided) {
      patternProvided = true;
      continue;
    }
    out.push({ token: arg });
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
    if (!inExpression && !arg.startsWith("-") && arg !== "(" && arg !== "!") {
      out.push({ token: arg });
      continue;
    }
    inExpression = true;
    if (patternOptions.has(arg)) i++;
  }
  return out;
}

function classifyFilterCommandArgs(args: string[]): ClassifiedArg[] {
  const out: ClassifiedArg[] = [];
  let sawFilter = false;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i] as string;
    if (arg === "-f" || arg === "--from-file") {
      if (args[i + 1]) out.push({ token: args[++i] as string });
      sawFilter = true;
      continue;
    }
    if (isOption(arg)) continue;
    if (!sawFilter) {
      sawFilter = true;
      continue;
    }
    out.push({ token: arg });
  }
  return out;
}

function classifyInterpreterArgs(cmd: string, args: string[]): ClassifiedArg[] {
  const codeFlags =
    cmd === "python" || cmd.startsWith("python")
      ? new Set(["-c"])
      : cmd === "php"
        ? new Set(["-r"])
        : new Set(["-e"]);
  const out: ClassifiedArg[] = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i] as string;
    if (codeFlags.has(arg)) {
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

/**
 * Classify `go` subcommand arguments.
 *
 * Go commands take package patterns, not file paths, as positional args
 * for most subcommands. Package patterns like `./...`, `pkg/...`,
 * or `github.com/user/repo/...` use Go's `...` wildcard and are not
 * filesystem paths.
 *
 * `go run` is an exception: it takes .go file operands, emitted with
 * `forcePath` since bare filenames like `main.go` don't pass
 * `maybePathLike`.
 *
 * File-valued flags (e.g. `-o`, `-modfile`, `-overlay`) are kept
 * so that policy checks can still gate them.
 *
 * Global flags like `-C dir` are handled before subcommand detection
 * so their values aren't mistaken for the subcommand.
 */
function classifyGoArgs(args: string[]): ClassifiedArg[] {
  const out: ClassifiedArg[] = [];
  const fileFlags = new Set(["-o", "-modfile", "-overlay"]);

  // Global flags that consume a value and must be skipped before
  // subcommand detection. E.g. `go -C /tmp test ./...`
  const globalFlagsWithValues = new Set(["-C"]);

  let subcommand: string | undefined;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i] as string;

    // Handle file-valued flags
    if (fileFlags.has(arg)) {
      if (args[i + 1]) out.push({ token: args[++i] as string });
      continue;
    }

    // Handle joined file flags like -o=./bin/app
    if (arg.startsWith("-o=")) {
      out.push({ token: arg.slice(3) });
      continue;
    }

    // Skip global flags with values before subcommand detection
    if (!subcommand && globalFlagsWithValues.has(arg)) {
      i++; // skip value
      continue;
    }
    if (!subcommand && arg.startsWith("-C=")) {
      // joined form -C=/tmp
      continue;
    }

    if (isOption(arg)) continue;

    // First non-flag positional is the subcommand
    if (!subcommand) {
      subcommand = arg;
      continue;
    }

    // `go run` takes .go file operands; emit with forcePath since
    // bare filenames like main.go don't pass maybePathLike.
    // All other subcommands take package patterns; skip them.
    if (subcommand === "run" && arg.endsWith(".go")) {
      out.push({ token: arg, forcePath: true });
    }
  }
  return out;
}
