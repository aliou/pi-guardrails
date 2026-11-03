import { visibleWidth } from "@earendil-works/pi-tui";

/**
 * Truncate text to `maxWidth` display cells, appending `ellipsis` when text
 * overflows. Unlike `truncateToWidth` from `@earendil-works/pi-tui`, this
 * never injects resets (so caller-applied styling survives truncation) and
 * its CSI parser accepts every escape sequence final, so non-SGR sequences
 * neither swallow visible text nor skew the measured width.
 */
export function truncateToWidth(
  text: string,
  maxWidth: number,
  ellipsis = "…",
  pad = false,
): string {
  if (maxWidth <= 0) return "";
  if (text.length === 0) return pad ? " ".repeat(maxWidth) : "";

  const ellipsisWidth = visibleWidth(ellipsis);
  if (ellipsisWidth >= maxWidth) {
    const textWidth = visibleWidth(text);
    if (textWidth <= maxWidth) {
      return pad ? text + " ".repeat(maxWidth - textWidth) : text;
    }

    const clippedEllipsis = truncateFragmentToWidth(ellipsis, maxWidth);
    if (clippedEllipsis.width === 0) {
      return pad ? " ".repeat(maxWidth) : "";
    }

    return finalizeTruncatedResult(
      "",
      0,
      clippedEllipsis.text,
      clippedEllipsis.width,
      maxWidth,
      pad,
    );
  }

  if (isPrintableAscii(text)) {
    if (text.length <= maxWidth) {
      return pad ? text + " ".repeat(maxWidth - text.length) : text;
    }

    const targetWidth = maxWidth - ellipsisWidth;
    return finalizeTruncatedResult(
      text.slice(0, targetWidth),
      targetWidth,
      ellipsis,
      ellipsisWidth,
      maxWidth,
      pad,
    );
  }

  const targetWidth = maxWidth - ellipsisWidth;
  let result = "";
  let visibleSoFar = 0;
  let keptWidth = 0;
  let keepContiguousPrefix = true;
  let overflowed = false;
  let exhaustedInput = false;
  const hasAnsi = text.includes("\u001b");
  const hasTabs = text.includes("\t");

  if (!hasAnsi && !hasTabs) {
    for (const { segment } of segmenter.segment(text)) {
      const width = visibleWidth(segment);
      if (keepContiguousPrefix && keptWidth + width <= targetWidth) {
        result += segment;
        keptWidth += width;
      } else {
        keepContiguousPrefix = false;
      }

      visibleSoFar += width;
      if (visibleSoFar > maxWidth) {
        overflowed = true;
        break;
      }
    }
    exhaustedInput = !overflowed;
  } else {
    let index = 0;
    let pendingAnsi = "";
    while (index < text.length) {
      const ansi = readAnsiSequence(text, index);
      if (ansi) {
        pendingAnsi += ansi;
        index += ansi.length;
        continue;
      }

      if (text[index] === "\t") {
        if (keepContiguousPrefix && keptWidth + 3 <= targetWidth) {
          if (pendingAnsi) {
            result += pendingAnsi;
            pendingAnsi = "";
          }
          result += "\t";
          keptWidth += 3;
        } else {
          keepContiguousPrefix = false;
          pendingAnsi = "";
        }

        visibleSoFar += 3;
        if (visibleSoFar > maxWidth) {
          overflowed = true;
          break;
        }
        index++;
        continue;
      }

      let end = index;
      while (end < text.length && text[end] !== "\t") {
        const nextAnsi = readAnsiSequence(text, end);
        if (nextAnsi) break;
        end++;
      }

      for (const { segment } of segmenter.segment(text.slice(index, end))) {
        const width = visibleWidth(segment);
        if (keepContiguousPrefix && keptWidth + width <= targetWidth) {
          if (pendingAnsi) {
            result += pendingAnsi;
            pendingAnsi = "";
          }
          result += segment;
          keptWidth += width;
        } else {
          keepContiguousPrefix = false;
          pendingAnsi = "";
        }

        visibleSoFar += width;
        if (visibleSoFar > maxWidth) {
          overflowed = true;
          break;
        }
      }

      if (overflowed) break;
      index = end;
    }
    exhaustedInput = index >= text.length;
  }

  if (!overflowed && exhaustedInput) {
    return pad ? text + " ".repeat(Math.max(0, maxWidth - visibleSoFar)) : text;
  }

  return finalizeTruncatedResult(
    result,
    keptWidth,
    ellipsis,
    ellipsisWidth,
    maxWidth,
    pad,
  );
}

const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });

function isPrintableAscii(text: string): boolean {
  for (let index = 0; index < text.length; index++) {
    const code = text.charCodeAt(index);
    if (code < 0x20 || code > 0x7e) return false;
  }
  return true;
}

function truncateFragmentToWidth(
  text: string,
  maxWidth: number,
): { text: string; width: number } {
  if (maxWidth <= 0 || text.length === 0) {
    return { text: "", width: 0 };
  }

  if (isPrintableAscii(text)) {
    const clipped = text.slice(0, maxWidth);
    return { text: clipped, width: clipped.length };
  }

  const hasAnsi = text.includes("\u001b");
  const hasTabs = text.includes("\t");
  if (!hasAnsi && !hasTabs) {
    let result = "";
    let width = 0;

    for (const { segment } of segmenter.segment(text)) {
      const segmentWidth = visibleWidth(segment);
      if (width + segmentWidth > maxWidth) break;
      result += segment;
      width += segmentWidth;
    }

    return { text: result, width };
  }

  let result = "";
  let width = 0;
  let index = 0;
  let pendingAnsi = "";

  while (index < text.length) {
    const ansi = readAnsiSequence(text, index);
    if (ansi) {
      pendingAnsi += ansi;
      index += ansi.length;
      continue;
    }

    if (text[index] === "\t") {
      if (width + 3 > maxWidth) break;
      if (pendingAnsi) {
        result += pendingAnsi;
        pendingAnsi = "";
      }
      result += "\t";
      width += 3;
      index++;
      continue;
    }

    let end = index;
    while (end < text.length && text[end] !== "\t") {
      const nextAnsi = readAnsiSequence(text, end);
      if (nextAnsi) break;
      end++;
    }

    for (const { segment } of segmenter.segment(text.slice(index, end))) {
      const segmentWidth = visibleWidth(segment);
      if (width + segmentWidth > maxWidth) {
        return { text: result, width };
      }
      if (pendingAnsi) {
        result += pendingAnsi;
        pendingAnsi = "";
      }
      result += segment;
      width += segmentWidth;
    }

    index = end;
  }

  return { text: result, width };
}

function finalizeTruncatedResult(
  prefix: string,
  prefixWidth: number,
  ellipsis: string,
  ellipsisWidth: number,
  maxWidth: number,
  pad: boolean,
): string {
  const width = prefixWidth + ellipsisWidth;
  const result = ellipsis.length > 0 ? `${prefix}${ellipsis}` : prefix;
  return pad ? result + " ".repeat(Math.max(0, maxWidth - width)) : result;
}

function readAnsiSequence(text: string, index: number): string | null {
  const ESCAPE = "\u001b";
  if (text[index] !== ESCAPE) return null;

  const next = text[index + 1];
  if (next === "[") {
    const code = text.slice(index);
    const pattern = new RegExp(`^${ESCAPE}\\[[0-?]*[ -/]*[@-~]`, "u");
    const match = code.match(pattern);
    return match?.[0] ?? text[index];
  }

  if (next === "]" || next === "_") {
    const rest = text.slice(index);
    const bel = rest.indexOf("\u0007");
    const st = rest.indexOf("\u001b\\");
    const end = [bel, st]
      .filter((value) => value >= 0)
      .sort((a, b) => a - b)[0];
    if (end === undefined) return text[index];
    return rest.slice(0, end + (end === st ? 2 : 1));
  }

  return text.slice(index, Math.min(index + 2, text.length));
}
