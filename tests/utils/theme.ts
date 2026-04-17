/**
 * No-op theme for testing render functions. Every styling function returns
 * the text unchanged, which is enough to exercise renderCall / renderResult
 * without pulling in a real terminal theme.
 */

import type { Theme } from "@mariozechner/pi-coding-agent";

const identity = (_color: string, text: string) => text;

export const NOOP_THEME: Theme = {
  fg: identity,
  bg: identity,
  bold: (t: string) => t,
  italic: (t: string) => t,
  underline: (t: string) => t,
  strikethrough: (t: string) => t,
  inverse: (t: string) => t,
} as Theme;
