import {
  createEventBus,
  type ExtensionAPI,
} from "@earendil-works/pi-coding-agent";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createDelegateRoster,
  type DelegationRequest,
  runDelegates,
} from "../../src/shared/delegation";
import noNetwork from "./no-network";
import slowReview from "./slow-review";

function fakePi() {
  return {
    events: createEventBus(),
    on: vi.fn(),
  } as unknown as ExtensionAPI;
}

function command(command: string): DelegationRequest {
  return {
    feature: "permissionGate",
    action: { kind: "command", command },
    reason: "flagged",
    toolName: "bash",
    input: { command },
  };
}

const ctx = {
  cwd: "/w",
  sessionManager: {} as never,
  modelRegistry: {} as never,
};

afterEach(() => {
  vi.useRealTimers();
});

describe("example delegates", () => {
  it.each([
    ["loaded before Guardrails", true],
    ["loaded after Guardrails", false],
  ])("register when %s", (_label, delegateFirst) => {
    const pi = fakePi();
    if (delegateFirst) {
      noNetwork(pi);
      slowReview(pi);
    }
    const roster = createDelegateRoster(pi);
    if (!delegateFirst) {
      noNetwork(pi);
      slowReview(pi);
    }
    expect(roster.list().map((d) => d.id)).toEqual([
      "example:no-network",
      "example:slow-review",
    ]);
  });

  it("no-network blocks downloads, allows other commands, abstains on files", async () => {
    const pi = fakePi();
    const roster = createDelegateRoster(pi);
    noNetwork(pi);
    const [delegate] = roster.list();
    const run = (request: DelegationRequest) =>
      runDelegates([delegate as never], request, ctx, { timeoutMs: 1000 });

    expect(
      (await run(command("curl -o x https://e.com")))[0]?.answer?.verdict,
    ).toBe("block");
    expect((await run(command("rm -rf dist")))[0]?.answer?.verdict).toBe(
      "allow",
    );
    const file = await run({
      ...command("x"),
      feature: "pathAccess",
      action: { kind: "file", path: "/etc/hosts" },
    });
    expect(file[0]?.status).toBe("abstained");
  });

  it("slow-review allows after its delay and times out under a shorter deadline", async () => {
    vi.useFakeTimers();
    const pi = fakePi();
    const roster = createDelegateRoster(pi);
    slowReview(pi);
    const delegates = roster.list();

    const allowed = runDelegates(delegates, command("rm -rf dist"), ctx, {
      timeoutMs: 5000,
    });
    await vi.advanceTimersByTimeAsync(1500);
    expect((await allowed)[0]?.answer?.verdict).toBe("allow");

    const timedOut = runDelegates(delegates, command("rm -rf dist"), ctx, {
      timeoutMs: 500,
    });
    await vi.advanceTimersByTimeAsync(500);
    expect((await timedOut)[0]?.status).toBe("timeout");
  });
});
