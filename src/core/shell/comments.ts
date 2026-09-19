/**
 * Comment stripping for bash command strings.
 *
 * `@aliou/sh` throws on some comment placements (`cmd && # note`), whereupon
 * extractors fall back to regex tokenization of the raw text. Naive
 * tokenization pairs apostrophes inside comments (`# don't forget …`) and
 * turns comment text into garbage path candidates (issue #105). Stripping
 * comments before tokenizing removes that entire class from the fallback.
 *
 * A `#` starts a comment when it appears unquoted at the start of a word —
 * bash's own rule. Everything through the end of that line is discarded,
 * including any quotes the comment text contains.
 */

/**
 * Whether the text accumulated so far ends at a position where a bare `#`
 * would begin a comment: at the start of the command, or right after
 * whitespace or a command separator. `${var#x}` and `foo#bar` are therefore
 * literal.
 */
function endsAtWordBoundary(out: string): boolean {
  if (out.length === 0) return true;
  const prev = out[out.length - 1];
  return prev !== undefined && /\s|[;|&({]/.test(prev);
}

export function stripBashComments(command: string): string {
  let out = "";
  let quote: '"' | "'" | "`" | undefined;
  let i = 0;

  while (i < command.length) {
    const ch = command[i];
    if (ch === undefined) break;

    if (quote === "'") {
      if (ch === "'") quote = undefined;
      out += ch;
      i++;
      continue;
    }
    if (quote === '"') {
      if (ch === "\\") {
        out += command.slice(i, i + 2);
        i += 2;
        continue;
      }
      if (ch === '"') quote = undefined;
      out += ch;
      i++;
      continue;
    }
    if (quote === "`") {
      if (ch === "`") quote = undefined;
      out += ch;
      i++;
      continue;
    }

    if (ch === "\\") {
      // Backslash escape outside quotes: `\#` is a literal `#`.
      if (i + 1 >= command.length) break;
      out += command.slice(i, i + 2);
      i += 2;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === "`") {
      quote = ch;
      out += ch;
      i++;
      continue;
    }
    if (ch === "#" && endsAtWordBoundary(out)) {
      // Comment to the end of the line; line structure stays intact.
      const newline = command.indexOf("\n", i);
      if (newline === -1) break;
      i = newline;
      continue;
    }
    out += ch;
    i++;
  }

  return out;
}
