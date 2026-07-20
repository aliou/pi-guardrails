import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { describe, expect, it, vi } from "vitest";
import {
  GUARDRAILS_ACTION_PROMPT_RESOLVED_EVENT,
  GUARDRAILS_ACTION_PROMPTED_EVENT,
} from "../../src/shared/events";
import herdrIntegration from "./index";

type EventHandler = (event: unknown) => void;

function createPi() {
  const handlers = new Map<string, EventHandler>();
  const pi = {
    events: {
      on: vi.fn((event: string, handler: EventHandler) => {
        handlers.set(event, handler);
      }),
      emit: vi.fn(),
    },
  };

  herdrIntegration(pi as unknown as ExtensionAPI);
  return { pi, handlers };
}

describe("Herdr integration", () => {
  it("reports blocked while Guardrails is waiting for a prompt", () => {
    const { pi, handlers } = createPi();

    handlers.get(GUARDRAILS_ACTION_PROMPTED_EVENT)?.({});

    expect(pi.events.emit).toHaveBeenCalledWith("herdr:blocked", {
      active: true,
      label: "Guardrails approval required",
    });
  });

  it("clears blocked state after the prompt resolves", () => {
    const { pi, handlers } = createPi();

    handlers.get(GUARDRAILS_ACTION_PROMPT_RESOLVED_EVENT)?.({});

    expect(pi.events.emit).toHaveBeenCalledWith("herdr:blocked", {
      active: false,
    });
  });
});
