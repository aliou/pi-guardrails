import { execFile } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const REPO_ROOT = join(import.meta.dirname, "..");

export const PI_CLI = join(
  REPO_ROOT,
  "node_modules",
  "@earendil-works",
  "pi-coding-agent",
  "dist",
  "cli.js",
);

export const SECRET_CANARY = "E2E-CANARY-SECRET-do-not-leak";
export const README_CANARY = "E2E-CANARY-README-safe-to-read";
export const OUTSIDE_CANARY = "E2E-CANARY-OUTSIDE-workspace";
export const WRITE_CANARY = "E2E-CANARY-WRITE-attempt";
export const POLICY_BLOCK_MARKER = "E2E-BLOCKED-BY-POLICY";
export const DENY_MESSAGE = "Command auto-denied: E2E dangerous command";
export const PATH_DENY_MESSAGE = "outside working directory";

export const POLICY_BLOCK_CONFIG = {
  enabled: true,
  applyBuiltinDefaults: false,
  features: { policies: true, permissionGate: false, pathAccess: false },
  onboarding: { completed: true },
  policies: {
    rules: [
      {
        id: "e2e-secrets",
        description: "E2E fixture secrets file",
        patterns: [{ pattern: "secrets.txt" }],
        protection: "noAccess",
        onlyIfExists: true,
        blockMessage: `${POLICY_BLOCK_MARKER}: {file}`,
      },
    ],
  },
};

export const POLICY_READONLY_CONFIG = {
  enabled: true,
  applyBuiltinDefaults: false,
  features: { policies: true, permissionGate: false, pathAccess: false },
  onboarding: { completed: true },
  policies: {
    rules: [
      {
        id: "e2e-readonly",
        description: "E2E fixture read-only file",
        patterns: [{ pattern: "locked.txt" }],
        protection: "readOnly",
        onlyIfExists: true,
        blockMessage: `${POLICY_BLOCK_MARKER}-write: {file}`,
      },
    ],
  },
};

export const PERMISSION_GATE_CONFIG = {
  enabled: true,
  applyBuiltinDefaults: false,
  features: { policies: false, permissionGate: true, pathAccess: false },
  onboarding: { completed: true },
  permissionGate: {
    autoDenyPatterns: [
      { pattern: "E2E_DANGEROUS_CMD", description: "E2E dangerous command" },
    ],
  },
};

export function pathAccessBlockConfig(): object {
  return {
    enabled: true,
    applyBuiltinDefaults: false,
    features: { policies: false, permissionGate: false, pathAccess: true },
    onboarding: { completed: true },
    pathAccess: { mode: "block", applyTo: "all", allowedPaths: [] },
  };
}

export function pathAccessAllowedConfig(outsideDir: string): object {
  return {
    enabled: true,
    applyBuiltinDefaults: false,
    features: { policies: false, permissionGate: false, pathAccess: true },
    onboarding: { completed: true },
    pathAccess: {
      mode: "block",
      applyTo: "all",
      allowedPaths: [{ kind: "directory", path: outsideDir }],
    },
  };
}

export interface FixtureProject {
  root: string;
  outsideDir: string;
  cleanup: () => void;
}

export function createFixtureProject(
  config: object | ((outsideDir: string) => object) = POLICY_BLOCK_CONFIG,
): FixtureProject {
  const base = mkdtempSync(join(tmpdir(), "pi-guardrails-e2e-"));
  const root = join(base, "project");
  const outsideDir = join(base, "outside");
  mkdirSync(join(root, ".pi", "extensions"), { recursive: true });
  mkdirSync(outsideDir, { recursive: true });

  writeFileSync(join(root, "README.md"), `# E2E Fixture\n\n${README_CANARY}\n`);
  writeFileSync(join(root, "secrets.txt"), `token=${SECRET_CANARY}\n`);
  writeFileSync(join(outsideDir, "outside-secret.txt"), `${OUTSIDE_CANARY}\n`);

  writeFileSync(
    join(root, ".pi", "settings.json"),
    JSON.stringify({ packages: [{ source: REPO_ROOT, skills: [] }] }, null, 2),
  );
  writeFileSync(
    join(root, ".pi", "extensions", "guardrails.json"),
    JSON.stringify(
      typeof config === "function" ? config(outsideDir) : config,
      null,
      2,
    ),
  );

  return {
    root,
    outsideDir,
    cleanup: () => rmSync(base, { recursive: true, force: true }),
  };
}

export async function tmux(...args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("tmux", args);
  return stdout;
}

export async function capturePane(session: string): Promise<string> {
  return tmux("capture-pane", "-t", session, "-p");
}

export async function waitForPane(
  session: string,
  pattern: string,
  timeoutMs: number,
): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  let pane = "";
  for (;;) {
    pane = await capturePane(session);
    if (pane.includes(pattern)) return pane;
    if (Date.now() > deadline) return pane;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
}

export async function waitForPaneContains(
  session: string,
  pattern: string,
  timeoutMs: number,
): Promise<string> {
  const pane = await waitForPane(session, pattern, timeoutMs);
  if (!pane.includes(pattern)) {
    throw new Error(
      `Timed out after ${timeoutMs}ms waiting for ${JSON.stringify(pattern)} in pane.\n--- pane ---\n${pane}`,
    );
  }
  return pane;
}

export async function waitForPaneSettled(
  session: string,
  initialDelayMs = 5_000,
): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, initialDelayMs));
  let previous = await capturePane(session);
  for (;;) {
    await new Promise((resolve) => setTimeout(resolve, 1_000));
    const current = await capturePane(session);
    if (current === previous) return;
    previous = current;
  }
}

export async function startTuiSession(
  session: string,
  project: FixtureProject,
): Promise<void> {
  await tmux(
    "new-session",
    "-d",
    "-s",
    session,
    "-x",
    "120",
    "-y",
    "40",
    "-c",
    project.root,
    `node ${PI_CLI}`,
  );
  await waitForPaneSettled(session);
}
