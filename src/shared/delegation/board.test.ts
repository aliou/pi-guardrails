import type { Theme } from "@earendil-works/pi-coding-agent";
import { Loader, type TUI } from "@earendil-works/pi-tui";
import { describe, expect, it, vi } from "vitest";
import {
  DELEGATION_WIDGET_KEY,
  DelegationBoard,
  delegationBoard,
} from "./board";
import { DelegationProgress } from "./progress";
import type { DelegationRequest } from "./types";

const theme = {
  fg: (_c: string, t: string) => t,
  bold: (t: string) => t,
} as unknown as Theme;

function progress(command: string, startedAt: number, delegates = 3) {
  const request: DelegationRequest = {
    feature: "permissionGate",
    action: { kind: "command", command },
    reason: "flagged",
    toolName: "bash",
    input: {},
  };
  return new DelegationProgress(request, delegates, 4000, startedAt);
}

function fakeUI() {
  const setWidget = vi.fn();
  return { ui: { setWidget }, setWidget };
}

describe("DelegationBoard", () => {
  it("mounts one widget for concurrent decisions and removes it after the last", () => {
    const board = new DelegationBoard();
    const { ui, setWidget } = fakeUI();

    board.add("a", progress("rm -rf a", 0), ui);
    board.add("b", progress("rm -rf b", 1), ui);
    expect(setWidget).toHaveBeenCalledTimes(1);
    expect(setWidget).toHaveBeenCalledWith(
      DELEGATION_WIDGET_KEY,
      expect.any(Function),
    );

    board.remove("a");
    expect(setWidget).toHaveBeenCalledTimes(1);
    board.remove("b");
    expect(setWidget).toHaveBeenLastCalledWith(
      DELEGATION_WIDGET_KEY,
      undefined,
    );
    expect(board.size).toBe(0);
  });

  it("summarizes a single decision with its command, answers, and time left", () => {
    const board = new DelegationBoard();
    const p = progress("rm -rf build/cache", 0);
    p.update(0, {
      delegateId: "n",
      delegateName: "no-network",
      status: "answered",
      answer: { verdict: "allow", reason: "ok" },
      elapsedMs: 1,
    });
    board.add("a", p, fakeUI().ui);
    expect(board.summary(theme, 1400)).toBe(
      "deciding rm -rf build/cache · 1/3 answered · 2.6s left",
    );
  });

  it("summarizes several decisions as a count with the soonest timeout", () => {
    const board = new DelegationBoard();
    const { ui } = fakeUI();
    board.add("a", progress("a", 0), ui);
    board.add("b", progress("b", 1000), ui);
    expect(board.summary(theme, 2600)).toBe(
      "2 decisions in progress · 1.4s left",
    );
  });

  it("mounts Pi's Loader as the widget", () => {
    const board = new DelegationBoard();
    const { ui, setWidget } = fakeUI();
    board.add("a", progress("rm -rf x", performance.now()), ui);

    const factory = setWidget.mock.calls[0]?.[1] as (
      tui: TUI,
      theme: Theme,
    ) => Loader & { dispose(): void };
    const widget = factory({ requestRender: vi.fn() } as unknown as TUI, theme);
    expect(widget).toBeInstanceOf(Loader);
    expect(widget.render(100).join("\n")).toMatch(
      /\[guardrails\] \S deciding rm -rf x/,
    );
    widget.dispose();
  });

  it("ignores a UI that throws", () => {
    const board = new DelegationBoard();
    const ui = {
      setWidget: vi.fn(() => {
        throw new Error("stale");
      }),
    };
    expect(() => board.add("a", progress("x", 0), ui)).not.toThrow();
    expect(() => board.remove("a")).not.toThrow();
  });

  it("is shared process-wide", () => {
    expect(delegationBoard()).toBe(delegationBoard());
  });
});
