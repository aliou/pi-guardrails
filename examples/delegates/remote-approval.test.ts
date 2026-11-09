import { existsSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  createEventBus,
  type ExtensionAPI,
} from "@earendil-works/pi-coding-agent";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createDelegateRoster,
  listResponders,
  racePrompt,
} from "../../src/shared/delegation";
import remoteApproval from "./remote-approval";

function fakePi() {
  return {
    events: createEventBus(),
    on: vi.fn(),
  } as unknown as ExtensionAPI;
}

const ctx = {
  cwd: "/w",
  sessionManager: {} as never,
  modelRegistry: {} as never,
};

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("remote-approval example", () => {
  it("answers only the prompt its answer file names", async () => {
    const dir = "/approvals";
    vi.stubEnv("GUARDRAILS_APPROVAL_DIR", dir);
    const pi = fakePi();
    const roster = createDelegateRoster(pi);
    remoteApproval(pi);
    const responders = listResponders(roster);
    expect(responders.map((d) => d.id)).toEqual(["example:remote-approval"]);

    const race = racePrompt(
      responders,
      {
        feature: "permissionGate",
        action: { kind: "command", command: "rm -rf dist" },
        reason: "flagged",
        toolName: "bash",
        input: { command: "rm -rf dist" },
        promptId: "p-1",
        choices: ["allow", "deny"],
      },
      ctx,
      {
        timeoutMs: 0,
        local: (signal) =>
          new Promise<string>((resolve) =>
            signal.addEventListener("abort", () => resolve("dismissed")),
          ),
      },
    );

    await vi.waitFor(() =>
      expect(existsSync(join(dir, "p-1.json"))).toBe(true),
    );
    await writeFile(join(dir, "p-2.answer"), "allow");
    await writeFile(join(dir, "p-1.answer"), "deny\n");

    await expect(race).resolves.toMatchObject({
      by: "responder",
      response: { choice: "deny" },
    });
    await vi.waitFor(() =>
      expect(existsSync(join(dir, "p-1.json"))).toBe(false),
    );
  });
});
