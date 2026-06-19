import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { vol } from "memfs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createGuardrailsConfigLoader } from "./loader";
import { CURRENT_VERSION } from "./migration";

describe("guardrails config persistence", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("adds the current config version when saving a new partial local config", async () => {
    vi.stubEnv("PI_CODING_AGENT_DIR", "/tmp/pi-agent-config-save");

    const cwd = process.cwd();
    const piDir = join(cwd, ".pi");
    const configPath = join(piDir, "extensions/guardrails.json");
    const backupPath = join(piDir, "extensions/guardrails.v0.json");
    vol.fromJSON({ [join(piDir, ".keep")]: "" });

    const configLoader = createGuardrailsConfigLoader();

    await configLoader.load();
    await configLoader.save("local", {
      pathAccess: {
        allowedPaths: [{ kind: "directory", path: "/tmp/outside" }],
      },
    });

    const saved = JSON.parse(await readFile(configPath, "utf-8"));
    expect(saved.version).toBe(CURRENT_VERSION);
    expect(saved.pathAccess.allowedPaths).toEqual([
      { kind: "directory", path: "/tmp/outside" },
    ]);

    await configLoader.load();

    expect(existsSync(backupPath)).toBe(false);
  });

  it("preserves an existing config version when saving", async () => {
    vi.stubEnv("PI_CODING_AGENT_DIR", "/tmp/pi-agent-config-existing");

    const cwd = process.cwd();
    const piDir = join(cwd, ".pi");
    const configPath = join(piDir, "extensions/guardrails.json");
    vol.fromJSON({ [join(piDir, ".keep")]: "" });

    const configLoader = createGuardrailsConfigLoader();

    await configLoader.load();
    await configLoader.save("local", {
      version: "0.9.0-20260327",
      enabled: false,
      pathAccess: {
        allowedPaths: [{ kind: "directory", path: "/tmp/existing" }],
      },
    });

    const saved = JSON.parse(await readFile(configPath, "utf-8"));
    expect(saved).toMatchObject({
      version: "0.9.0-20260327",
      enabled: false,
      pathAccess: {
        allowedPaths: [{ kind: "directory", path: "/tmp/existing" }],
      },
    });
  });

  it("queues migration messages via drainMessages() when migrations run", async () => {
    vi.stubEnv("PI_CODING_AGENT_DIR", "/tmp/pi-agent-config-migration-msgs");

    const cwd = process.cwd();
    const piDir = join(cwd, ".pi");
    const configPath = join(piDir, "extensions/guardrails.json");
    // Legacy string-form allowedPaths triggers the 010-allowed-paths-objects
    // migration, which declares a `message`.
    vol.fromJSON({
      [configPath]: JSON.stringify({
        version: "0.12.2-20260521",
        pathAccess: {
          mode: "ask",
          allowedPaths: ["/tmp/outside/"],
        },
      }),
    });

    const configLoader = createGuardrailsConfigLoader();

    await configLoader.load();

    const messages = configLoader.drainMessages();
    expect(messages).toContain(
      "pathAccess.allowedPaths was migrated from path strings to { kind, path } objects.",
    );
    // Draining clears the queue.
    expect(configLoader.drainMessages()).toEqual([]);
  });
});
