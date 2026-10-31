import type {
  ExtensionUIContext,
  Theme,
} from "@earendil-works/pi-coding-agent";
import { type Component, Loader, type TUI } from "@earendil-works/pi-tui";
import { actionLabel, TAG } from "./entry";
import type { DelegationProgress } from "./progress";

export const DELEGATION_WIDGET_KEY = "guardrails:delegation";

type WidgetUI = Pick<ExtensionUIContext, "setWidget">;

export class DelegationBoard {
  private readonly decisions = new Map<string, DelegationProgress>();
  private ui: WidgetUI | undefined;

  get size(): number {
    return this.decisions.size;
  }

  add(id: string, progress: DelegationProgress, ui: WidgetUI): void {
    this.decisions.set(id, progress);
    this.ui = ui;
    if (this.decisions.size === 1) this.setWidget(this.factory);
  }

  remove(id: string): void {
    if (!this.decisions.delete(id)) return;
    if (this.decisions.size === 0) this.setWidget(undefined);
  }

  summary(theme: Pick<Theme, "fg" | "bold">, now = performance.now()): string {
    const all = [...this.decisions.values()];
    if (all.length === 0) return "";
    const left = Math.min(...all.map((p) => p.remainingMs(now)));
    const leftText = theme.fg("dim", `${(left / 1000).toFixed(1)}s left`);

    if (all.length === 1) {
      const [only] = all as [DelegationProgress];
      const action = actionLabel(only.request.action, only.request.toolName);
      return `deciding ${action} ${theme.fg("dim", `· ${only.answered}/${only.total} answered ·`)} ${leftText}`;
    }
    return `${all.length} decisions in progress ${theme.fg("dim", "·")} ${leftText}`;
  }

  private readonly factory = (
    tui: TUI,
    theme: Theme,
  ): Component & { dispose(): void } => {
    const loader = new Loader(
      tui,
      (frame) => `${theme.fg("accent", TAG)} ${theme.fg("accent", frame)}`,
      () => this.summary(theme),
      "",
    );
    return Object.assign(loader, { dispose: () => loader.stop() });
  };

  private setWidget(content: typeof this.factory | undefined): void {
    try {
      this.ui?.setWidget(DELEGATION_WIDGET_KEY, content);
    } catch {}
  }
}

const BOARD_KEY = Symbol.for("@aliou/pi-guardrails/delegation-board@1");

export function delegationBoard(): DelegationBoard {
  const store = globalThis as typeof globalThis & {
    [BOARD_KEY]?: DelegationBoard;
  };
  store[BOARD_KEY] ??= new DelegationBoard();
  return store[BOARD_KEY];
}
