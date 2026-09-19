import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { vol } from "memfs";
import { afterEach, describe, expect, it, vi } from "vitest";
import pkg from "../../../package.json" with { type: "json" };
import { createGuardrailsConfigLoader } from "./loader";

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
    expect(saved.version).toBe(pkg.version);
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

  it("notifies about permission gate pattern merging once per config", async () => {
    vi.stubEnv("PI_CODING_AGENT_DIR", "/tmp/pi-agent-pattern-merge-notice");

    const cwd = process.cwd();
    const configPath = join(cwd, ".pi/extensions/guardrails.json");
    vol.fromJSON({
      [configPath]: JSON.stringify({
        version: "0.17.1",
        permissionGate: {
          autoDenyPatterns: [{ pattern: "foo", regex: true }],
        },
      }),
    });

    const configLoader = createGuardrailsConfigLoader();
    await configLoader.load();

    const messages = configLoader.drainMessages();
    expect(messages).toHaveLength(1);
    expect(messages[0]).toContain("merged across global and project configs");

    // Config without any pattern arrays does not get the notice.
    vol.reset();
    vol.fromJSON({
      [configPath]: JSON.stringify({ version: "0.17.1", enabled: true }),
    });
    const otherLoader = createGuardrailsConfigLoader();
    await otherLoader.load();
    expect(otherLoader.drainMessages()).toEqual([]);

    // Config already stamped at/after 0.19.0 does not re-trigger, even with
    // patterns (e.g. the user added them after the migration shipped).
    vol.reset();
    vol.fromJSON({
      [configPath]: JSON.stringify({
        version: "0.19.0",
        permissionGate: {
          autoDenyPatterns: [{ pattern: "foo", regex: true }],
        },
      }),
    });
    const freshLoader = createGuardrailsConfigLoader();
    await freshLoader.load();
    expect(freshLoader.drainMessages()).toEqual([]);
  });
});

describe("permission gate pattern merging across scopes", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vol.reset();
  });

  it("unions permissionGate.autoDenyPatterns from global and local scopes", async () => {
    vi.stubEnv("PI_CODING_AGENT_DIR", "/tmp/pi-agent-auto-deny-merge");

    const cwd = process.cwd();
    vol.fromJSON({
      "/tmp/pi-agent-auto-deny-merge/extensions/guardrails.json":
        JSON.stringify({
          version: pkg.version,
          permissionGate: {
            autoDenyPatterns: [
              {
                pattern: "\\\\bfind\\\\s+/(?=\\\\s|$)",
                regex: true,
                description: "global find /",
              },
            ],
          },
        }),
      [join(cwd, ".pi/extensions/guardrails.json")]: JSON.stringify({
        version: pkg.version,
        permissionGate: {
          autoDenyPatterns: [
            {
              pattern: "project-skills-cli",
              regex: true,
              description: "local skills cli",
            },
          ],
        },
      }),
    });

    const configLoader = createGuardrailsConfigLoader();
    await configLoader.load();
    const config = configLoader.getConfig();

    const patterns = config.permissionGate.autoDenyPatterns.map(
      (p) => p.pattern,
    );
    expect(patterns).toContain("\\\\bfind\\\\s+/(?=\\\\s|$)");
    expect(patterns).toContain("project-skills-cli");
  });

  it("unions permissionGate.allowedPatterns and patterns, deduped by pattern", async () => {
    vi.stubEnv("PI_CODING_AGENT_DIR", "/tmp/pi-agent-patterns-merge");

    const cwd = process.cwd();
    vol.fromJSON({
      "/tmp/pi-agent-patterns-merge/extensions/guardrails.json": JSON.stringify(
        {
          version: pkg.version,
          permissionGate: {
            patterns: [{ pattern: "global-only" }],
            allowedPatterns: [{ pattern: "allowed-a" }],
          },
        },
      ),
      [join(cwd, ".pi/extensions/guardrails.json")]: JSON.stringify({
        version: pkg.version,
        permissionGate: {
          patterns: [{ pattern: "global-only" }, { pattern: "local-only" }],
          allowedPatterns: [{ pattern: "allowed-b" }],
        },
      }),
    });

    const configLoader = createGuardrailsConfigLoader();
    await configLoader.load();
    const config = configLoader.getConfig();

    // Defaults are included (same as builtin policy rules); scope arrays are
    // unioned by pattern, so "global-only" survives the local override.
    const patterns = config.permissionGate.patterns.map((p) => p.pattern);
    expect(patterns).toContain("global-only");
    expect(patterns).toContain("local-only");
    expect(patterns).toContain("rm -rf");
    expect(patterns.filter((p) => p === "global-only")).toHaveLength(1);
    expect(
      config.permissionGate.allowedPatterns.map((p) => p.pattern).sort(),
    ).toEqual(["allowed-a", "allowed-b"]);
  });
});
