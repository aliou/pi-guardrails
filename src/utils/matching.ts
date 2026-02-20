/**
 * Pattern compilation for guardrails matching.
 *
 * Two contexts with different default semantics:
 * - File context: default is glob matching against filename.
 * - Command context: default is substring matching against raw command string.
 *
 * Both support `regex: true` for full regex matching.
 */

import type { PatternConfig } from "../config";
import { pendingWarnings } from "./warnings";

export interface CompiledPattern {
  test: (input: string) => boolean;
  source: PatternConfig;
}

/**
 * Convert a glob pattern to a regex.
 * `*` matches any non-`/` chars, `?` matches a single char.
 * The rest is escaped.
 */
export function globToRegex(glob: string): RegExp {
  let regex = "";
  for (const ch of glob) {
    switch (ch) {
      case "*":
        regex += "[^/]*";
        break;
      case "?":
        regex += "[^/]";
        break;
      case ".":
      case "(":
      case ")":
      case "+":
      case "^":
      case "$":
      case "{":
      case "}":
      case "|":
      case "\\":
      case "[":
      case "]":
        regex += `\\${ch}`;
        break;
      default:
        regex += ch;
    }
  }
  return new RegExp(`^${regex}$`, "i");
}

/**
 * Compile a single pattern for file-context matching.
 * Default: glob against the basename of the path.
 * regex: true -> full regex (case-insensitive) against the full path.
 */
export function compileFilePattern(config: PatternConfig): CompiledPattern {
  if (config.regex) {
    try {
      const re = new RegExp(config.pattern, "i");
      return { test: (input) => re.test(input), source: config };
    } catch {
      pendingWarnings.push(
        `Invalid regex in guardrails config: ${config.pattern}`,
      );
      return { test: () => false, source: config };
    }
  }

  const re = globToRegex(config.pattern);
  return {
    test: (input) => {
      // Match against basename
      const basename = input.split("/").pop() ?? input;
      return re.test(basename);
    },
    source: config,
  };
}

/**
 * Compile a single pattern for command-context matching.
 * Default: substring match against raw command string.
 * regex: true -> full regex against raw command string.
 */
export function compileCommandPattern(config: PatternConfig): CompiledPattern {
  if (config.regex) {
    try {
      const re = new RegExp(config.pattern);
      return { test: (input) => re.test(input), source: config };
    } catch {
      pendingWarnings.push(
        `Invalid regex in guardrails config: ${config.pattern}`,
      );
      return { test: () => false, source: config };
    }
  }

  return {
    test: (input) => input.includes(config.pattern),
    source: config,
  };
}

/**
 * Compile an array of patterns for file-context matching.
 */
export function compileFilePatterns(
  configs: PatternConfig[],
): CompiledPattern[] {
  return configs.map(compileFilePattern);
}

/**
 * Compile an array of patterns for command-context matching.
 */
export function compileCommandPatterns(
  configs: PatternConfig[],
): CompiledPattern[] {
  return configs.map(compileCommandPattern);
}
