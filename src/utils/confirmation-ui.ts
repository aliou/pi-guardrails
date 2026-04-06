/**
 * Shared confirmation UI components for guardrails.
 *
 * Used by both permissionGate and policies "ask" protection.
 */

import {
  DynamicBorder,
  getMarkdownTheme,
  type KeybindingsManager,
  type Theme,
} from "@mariozechner/pi-coding-agent";
import {
  Box,
  Container,
  Key,
  Markdown,
  matchesKey,
  Spacer,
  Text,
  type TUI,
  wrapTextWithAnsi,
} from "@mariozechner/pi-tui";

export type ConfirmResult = "allow" | "allow-session" | "deny";

interface Explanation {
  text: string;
  modelName: string;
  modelId: string;
  provider: string;
}

interface ConfirmationOptions {
  title: string;
  subtitle?: string;
  detailText: string;
  explanation?: Explanation | null;
  promptText: string;
  borderColor?: "error" | "warning";
}

/**
 * Create a confirmation UI handler for dangerous actions.
 * Returns a factory function compatible with ctx.ui.custom()
 */
export function createConfirmationUI(options: ConfirmationOptions) {
  const {
    title,
    subtitle,
    detailText,
    explanation,
    promptText,
    borderColor = "error",
  } = options;

  return (
    _tui: TUI,
    theme: Theme,
    _kb: KeybindingsManager,
    done: (result: ConfirmResult) => void,
  ) => {
    const container = new Container();
    const borderFn =
      borderColor === "error"
        ? (s: string) => theme.fg("error", s)
        : (s: string) => theme.fg("warning", s);

    if (explanation) {
      const explanationBox = new Box(1, 1, (s: string) =>
        theme.bg("customMessageBg", s),
      );
      explanationBox.addChild(
        new Text(
          theme.fg(
            "accent",
            theme.bold(
              `Model explanation (${explanation.modelName} / ${explanation.modelId} / ${explanation.provider})`,
            ),
          ),
          0,
          0,
        ),
      );
      explanationBox.addChild(new Spacer(1));
      explanationBox.addChild(
        new Markdown(explanation.text, 0, 0, getMarkdownTheme(), {
          color: (s: string) => theme.fg("text", s),
        }),
      );
      container.addChild(explanationBox);
    }

    container.addChild(new DynamicBorder(borderFn));
    container.addChild(
      new Text(theme.fg(borderColor, theme.bold(title)), 1, 0),
    );

    if (subtitle) {
      container.addChild(new Spacer(1));
      container.addChild(new Text(theme.fg("warning", subtitle), 1, 0));
    }

    container.addChild(new Spacer(1));
    container.addChild(new DynamicBorder((s: string) => theme.fg("muted", s)));

    const detailTextEl = new Text("", 1, 0);
    container.addChild(detailTextEl);

    container.addChild(new DynamicBorder((s: string) => theme.fg("muted", s)));
    container.addChild(new Spacer(1));
    container.addChild(new Text(theme.fg("text", promptText), 1, 0));
    container.addChild(new Spacer(1));
    container.addChild(
      new Text(
        theme.fg("dim", "y/enter: allow • a: allow for session • n/esc: deny"),
        1,
        0,
      ),
    );
    container.addChild(new DynamicBorder(borderFn));

    return {
      render: (width: number) => {
        const wrappedDetail = wrapTextWithAnsi(
          theme.fg("text", detailText),
          width - 4,
        ).join("\n");
        detailTextEl.setText(wrappedDetail);
        return container.render(width);
      },
      invalidate: () => container.invalidate(),
      handleInput: (data: string) => {
        if (matchesKey(data, Key.enter) || data === "y" || data === "Y") {
          done("allow");
        } else if (data === "a" || data === "A") {
          done("allow-session");
        } else if (
          matchesKey(data, Key.escape) ||
          data === "n" ||
          data === "N"
        ) {
          done("deny");
        }
      },
    };
  };
}
