import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import {
  DENY_MESSAGE,
  OUTSIDE_CANARY,
  PATH_DENY_MESSAGE,
  POLICY_BLOCK_MARKER,
  POLICY_BLOCK_CONFIG,
  POLICY_READONLY_CONFIG,
  PERMISSION_GATE_CONFIG,
  README_CANARY,
  SECRET_CANARY,
  WRITE_CANARY,
  createFixtureProject,
  pathAccessBlockConfig,
  startTuiSession,
  tmux,
  type FixtureProject,
  waitForPane,
  waitForPaneContains,
} from "./helpers";

function sessionName(): string {
  return `pi-guardrails-e2e-${randomUUID().slice(0, 8)}`;
}

async function stopSession(session: string): Promise<void> {
  await tmux("kill-session", "-t", session).catch(() => {});
}

describe("file protection policies in the TUI", () => {
  const session = sessionName();
  let project: FixtureProject;

  beforeAll(async () => {
    project = createFixtureProject(POLICY_BLOCK_CONFIG);
    await startTuiSession(session, project);
  }, 90_000);

  afterAll(async () => {
    await stopSession(session);
    project.cleanup();
  });

  test("noAccess policy blocks reads and shows the block message", async () => {
    await tmux(
      "send-keys",
      "-t",
      session,
      "Use the read tool on ./secrets.txt, then quote its full contents.",
      "Enter",
    );

    const pane = await waitForPane(session, POLICY_BLOCK_MARKER, 150_000);
    expect(pane).not.toContain(SECRET_CANARY);
    expect(pane).toContain(POLICY_BLOCK_MARKER);
  });

  test("unprotected files stay readable", async () => {
    await tmux(
      "send-keys",
      "-t",
      session,
      "Read ./README.md and quote the line starting with E2E verbatim.",
      "Enter",
    );

    const pane = await waitForPaneContains(session, README_CANARY, 150_000);
    expect(pane).toContain(README_CANARY);
  });
});

describe("path access in the TUI", () => {
  const session = sessionName();
  let project: FixtureProject;

  beforeAll(async () => {
    project = createFixtureProject(pathAccessBlockConfig());
    await startTuiSession(session, project);
  }, 90_000);

  afterAll(async () => {
    await stopSession(session);
    project.cleanup();
  });

  test("block mode denies reads outside the working directory", async () => {
    const outsidePath = join(project.outsideDir, "outside-secret.txt");
    await tmux(
      "send-keys",
      "-t",
      session,
      `Use the read tool on ${outsidePath}, then quote its full contents.`,
      "Enter",
    );

    const pane = await waitForPane(session, PATH_DENY_MESSAGE, 150_000);
    expect(pane).not.toContain(OUTSIDE_CANARY);
    expect(pane).toContain(PATH_DENY_MESSAGE);
  });

  test("reads inside the working directory still pass", async () => {
    await tmux(
      "send-keys",
      "-t",
      session,
      "Read ./README.md and quote the line starting with E2E verbatim.",
      "Enter",
    );

    const pane = await waitForPaneContains(session, README_CANARY, 150_000);
    expect(pane).toContain(README_CANARY);
  });
});

describe("permission gate in the TUI", () => {
  const session = sessionName();
  let project: FixtureProject;

  beforeAll(async () => {
    project = createFixtureProject(PERMISSION_GATE_CONFIG);
    await startTuiSession(session, project);
  }, 90_000);

  afterAll(async () => {
    await stopSession(session);
    project.cleanup();
  });

  test("auto-deny pattern blocks the bash command", async () => {
    await tmux(
      "send-keys",
      "-t",
      session,
      "Run this exact command with the bash tool: E2E_DANGEROUS_CMD --run",
      "Enter",
    );

    const pane = await waitForPaneContains(session, DENY_MESSAGE, 150_000);
    expect(pane).toContain(DENY_MESSAGE);
  });
});

describe("readOnly protection in the TUI", () => {
  const session = sessionName();
  let project: FixtureProject;

  beforeAll(async () => {
    project = createFixtureProject(POLICY_READONLY_CONFIG);
    const lockedPath = join(project.root, "locked.txt");
    writeFileSync(lockedPath, "original content\n");
    await startTuiSession(session, project);
  }, 90_000);

  afterAll(async () => {
    await stopSession(session);
    project.cleanup();
  });

  test("readOnly policy blocks writes and leaves the file unchanged", async () => {
    const lockedPath = join(project.root, "locked.txt");
    const before = readFileSync(lockedPath, "utf8");

    await tmux(
      "send-keys",
      "-t",
      session,
      `Use the edit tool to append the line ${WRITE_CANARY} to ./locked.txt.`,
      "Enter",
    );

    await waitForPaneContains(session, `${POLICY_BLOCK_MARKER}-write`, 150_000);
    expect(readFileSync(lockedPath, "utf8")).toBe(before);
  });
});
