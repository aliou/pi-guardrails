/**
 * Glob expansion using `fd` for env file protection.
 *
 * When a bash command contains shell globs referencing env files
 * (e.g. `.env*`), we expand them against the filesystem to check
 * if any expanded path matches a protected pattern.
 */

import { execFile } from "node:child_process";
import { resolve } from "node:path";

interface ExpandGlobOptions {
  cwd?: string;
  maxDepth?: number;
  maxResults?: number;
  timeout?: number;
}

/**
 * Expand a glob pattern using `fd`.
 * Returns matching file paths, or empty array on failure.
 *
 * fd is available at `~/.pi/agent/bin/fd` (in pi's PATH).
 */
export async function expandGlob(
  pattern: string,
  options: ExpandGlobOptions = {},
): Promise<string[]> {
  const {
    cwd = process.cwd(),
    maxDepth = 3,
    maxResults = 50,
    timeout = 2000,
  } = options;

  // Convert glob to fd-compatible regex.
  // fd uses regex by default, so we convert glob chars.
  const fdPattern = globToFdRegex(pattern);

  return new Promise((res) => {
    const args = [
      "--type",
      "f",
      "--max-depth",
      String(maxDepth),
      "--max-results",
      String(maxResults),
      "--no-ignore",
      "--hidden",
      fdPattern,
    ];

    const child = execFile("fd", args, { cwd, timeout }, (err, stdout) => {
      if (err) {
        res([]);
        return;
      }

      const files = stdout
        .trim()
        .split("\n")
        .filter(Boolean)
        .map((f) => resolve(cwd, f));

      res(files);
    });

    // Safety net: kill if timeout isn't handled by execFile
    setTimeout(() => {
      child.kill();
      res([]);
    }, timeout + 500);
  });
}

/**
 * Convert a shell glob to an fd-compatible regex pattern.
 * Handles `*`, `?`, and character classes `[...]`.
 */
function globToFdRegex(glob: string): string {
  let regex = "";
  let i = 0;
  while (i < glob.length) {
    const ch = glob[i] as string;
    switch (ch) {
      case "*":
        regex += "[^/]*";
        break;
      case "?":
        regex += "[^/]";
        break;
      case "[": {
        // Pass character classes through
        const end = glob.indexOf("]", i + 1);
        if (end !== -1) {
          regex += glob.slice(i, end + 1);
          i = end;
        } else {
          regex += "\\[";
        }
        break;
      }
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
        regex += `\\${ch}`;
        break;
      default:
        regex += ch;
    }
    i++;
  }
  return `^${regex}$`;
}

/**
 * Check if a string contains shell glob characters.
 */
export function hasGlobChars(s: string): boolean {
  return /[*?[\]]/.test(s);
}
