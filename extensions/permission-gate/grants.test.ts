import { beforeEach, describe, expect, it, vi } from "vitest";
import { configLoader } from "../../src/shared/config";
import { isCommandAllowed, saveCommandSessionGrant } from "./grants";

vi.mock("../../src/shared/config", () => ({
  configLoader: {
    getConfig: vi.fn(),
    save: vi.fn(),
  },
}));

const getConfig = vi.mocked(configLoader.getConfig);
const save = vi.mocked(configLoader.save);

describe("command session grants", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getConfig.mockReturnValue({
      permissionGate: { allowedPatterns: [] },
    } as unknown as ReturnType<typeof configLoader.getConfig>);
    save.mockResolvedValue(undefined);
  });

  it("stores an exact-match grant without changing configured pattern semantics", async () => {
    const command = "rm -rf ./scratch (old) && printf '$HOME'\n";

    await saveCommandSessionGrant(command);

    expect(save).toHaveBeenCalledWith("memory", {
      permissionGate: {
        allowedPatterns: [
          {
            pattern: expect.any(String),
            regex: true,
          },
        ],
      },
    });

    const saved = save.mock.calls[0]?.[1].permissionGate?.allowedPatterns?.[0];
    if (!saved) throw new Error("session grant was not saved");

    getConfig.mockReturnValue({
      permissionGate: { allowedPatterns: [saved] },
    } as unknown as ReturnType<typeof configLoader.getConfig>);

    expect(isCommandAllowed(command)).toBe(true);
    expect(isCommandAllowed(`${command}sudo --version`)).toBe(false);
    expect(
      isCommandAllowed(command.replace("./scratch", "./scratch-backup")),
    ).toBe(false);
  });

  it("keeps substring matching for configured allow patterns", () => {
    getConfig.mockReturnValue({
      permissionGate: { allowedPatterns: [{ pattern: "git status" }] },
    } as unknown as ReturnType<typeof configLoader.getConfig>);

    expect(isCommandAllowed("cd /repo && git status")).toBe(true);
  });
});
