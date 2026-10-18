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
export const BLOCK_MARKER = "E2E-BLOCKED-BY-POLICY";

export const POLICY_CONFIG = {
  enabled: true,
  applyBuiltinDefaults: false,
  features: {
    policies: true,
    permissionGate: false,
    pathAccess: false,
  },
  onboarding: { completed: true },
  policies: {
    rules: [
      {
        id: "e2e-secrets",
        description: "E2E fixture secrets file",
        patterns: [{ pattern: "secrets.txt" }],
        protection: "noAccess",
        onlyIfExists: true,
        blockMessage: `${BLOCK_MARKER}: {file}`,
      },
    ],
  },
};

export interface FixtureProject {
  root: string;
  cleanup: () => void;
}

export function createFixtureProject(): FixtureProject {
  const root = mkdtempSync(join(tmpdir(), "pi-guardrails-e2e-"));
  mkdirSync(join(root, ".pi", "extensions"), { recursive: true });

  writeFileSync(join(root, "README.md"), `# E2E Fixture\n\n${README_CANARY}\n`);
  writeFileSync(join(root, "secrets.txt"), `token=${SECRET_CANARY}\n`);

  writeFileSync(
    join(root, ".pi", "settings.json"),
    JSON.stringify({ packages: [{ source: REPO_ROOT, skills: [] }] }, null, 2),
  );
  writeFileSync(
    join(root, ".pi", "extensions", "guardrails.json"),
    JSON.stringify(POLICY_CONFIG, null, 2),
  );

  return {
    root,
    cleanup: () => rmSync(root, { recursive: true, force: true }),
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
