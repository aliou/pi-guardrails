/**
 * Pattern compilation for guardrails matching.
 *
 * Two contexts with different default semantics:
 * - File context: default is glob matching against filename.
 * - Command context: default is substring matching against raw command string.
 *
 * Both support `regex: true` for full regex matching.
 */

import { matchesGlob } from "node:path";
import type { CommandPatternConfig, FilePatternConfig } from "../config";
import { isPathInsideAny } from "./path";
import { pendingWarnings } from "./warnings";

interface CompiledPatternBase<TConfig> {
  source: TConfig;
}

export interface CompiledFilePattern
  extends CompiledPatternBase<FilePatternConfig> {
  test: (input: string, cwd: string) => boolean;
}

export interface CompiledCommandPattern
  extends CompiledPatternBase<CommandPatternConfig> {
  test: (input: string) => boolean;
}

/**
 * Normalize file paths before matching.
 * - Use forward slashes for cross-platform consistency.
 * - Drop leading "./" segments.
 * - Collapse duplicate slashes.
 */
export function normalizeFilePath(input: string): string {
  const normalized = input
    .replaceAll("\\", "/")
    .replace(/^(?:\.\/)+/, "")
    .replace(/\/{2,}/g, "/");
  return normalized;
}

/**
 * Compile a single pattern for file-context matching.
 * Default: glob matching.
 * - If pattern includes `/`, match full normalized relative path.
 * - Otherwise, match basename only (backward compatible).
 * regex: true -> full regex (case-insensitive) against normalized path.
 */
export function compileFilePattern(
  config: FilePatternConfig,
): CompiledFilePattern {
  if (config.regex) {
    try {
      const re = new RegExp(config.pattern, "i");
      return {
        test: (input, cwd) => {
          const normalized = normalizeFilePath(input);
          if (!re.test(normalized)) return false;
          if (config.pathFilter !== undefined) {
            return isPathInsideAny(config.pathFilter, cwd, input);
          }
          return true;
        },
        source: config,
      };
    } catch {
      pendingWarnings.push(
        `Invalid regex in guardrails config: ${config.pattern}`,
      );
      return { test: () => false, source: config };
    }
  }

  const matchFullPath = config.pattern.includes("/");

  return {
    test: (input, cwd) => {
      const normalized = normalizeFilePath(input);
      const candidate = matchFullPath
        ? normalized
        : (normalized.split("/").pop() ?? normalized);

      const matches = matchesGlob(candidate, config.pattern);
      if (!matches) return false;
      if (config.pathFilter !== undefined) {
        return isPathInsideAny(config.pathFilter, cwd, input);
      }
      return true;
    },
    source: config,
  };
}

/**
 * Compile a single pattern for command-context matching.
 * Default: substring match against raw command string.
 * regex: true -> full regex against raw command string.
 */
export function compileCommandPattern(
  config: CommandPatternConfig,
): CompiledCommandPattern {
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
  configs: FilePatternConfig[],
): CompiledFilePattern[] {
  return configs.map(compileFilePattern);
}

/**
 * Compile an array of patterns for command-context matching.
 */
export function compileCommandPatterns(
  configs: CommandPatternConfig[],
): CompiledCommandPattern[] {
  return configs.map(compileCommandPattern);
}
