import { visibleWidth } from "@earendil-works/pi-tui";
import { describe, expect, it } from "vitest";

import { truncateToWidth } from "./truncate";

const ESC = String.fromCodePoint(0x001b);
const RED = `${ESC}[31m`;
const RESET = `${ESC}[0m`;
const BG = `${ESC}[48;5;236m`;
const BG_OFF = `${ESC}[49m`;

describe("truncateToWidth", () => {
  it("returns short text unchanged and pads on request", () => {
    expect(truncateToWidth("short", 10)).toBe("short");
    expect(truncateToWidth("short", 10, "…", true)).toBe("short     ");
    expect(truncateToWidth("", 4, "…", true)).toBe("    ");
    expect(truncateToWidth("text", 0)).toBe("");
  });

  it("truncates to the requested width including the ellipsis", () => {
    expect(truncateToWidth("way too long line", 10)).toBe("way too l…");
    expect(visibleWidth(truncateToWidth("way too long line", 10))).toBe(10);
    expect(truncateToWidth("way too long line", 10, "")).toBe("way too lo");
  });

  it("never injects a reset, so caller styling survives", () => {
    // A reset here would end the caller's background early and leave the
    // ellipsis and padding unstyled.
    const truncated = truncateToWidth("way too long line here", 14, "…", true);

    expect(truncated).not.toContain(RESET);
    expect(`${BG}${truncated}${BG_OFF}`).toBe(`${BG}way too long …${BG_OFF}`);
  });

  it("keeps the colors of the text it retains", () => {
    expect(truncateToWidth(`${RED}red text that is long${RESET}`, 10)).toBe(
      `${RED}red text …`,
    );
  });

  it("measures wide and zero-width characters by display cells", () => {
    const wide = "日本語テキスト";
    const truncated = truncateToWidth(wide, 8, "…");

    expect(visibleWidth(truncated)).toBeLessThanOrEqual(8);
    expect(truncated).toBe("日本語…");
  });

  it("does not swallow text when a CSI sequence is not an SGR", () => {
    // A parser that scans for the next "m" would eat "hello " here and
    // report the wrong width.
    const text = `${ESC}[2Ahello more text`;

    expect(truncateToWidth(text, 8, "")).toBe(`${ESC}[2Ahello mo`);
  });

  it("pads to the full width when text is truncated", () => {
    expect(truncateToWidth("way too long line", 20, "…", true)).toBe(
      "way too long line   ",
    );
  });
});
