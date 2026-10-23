import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { RpcClient } from "@earendil-works/pi-coding-agent";
import { afterAll, afterEach, describe, expect, test } from "vitest";
import {
  createFixtureProject,
  DENY_MESSAGE,
  OUTSIDE_CANARY,
  PATH_DENY_MESSAGE,
  PERMISSION_GATE_CONFIG,
  PI_CLI,
  POLICY_BLOCK_MARKER,
  POLICY_BLOCK_CONFIG,
  POLICY_READONLY_CONFIG,
  README_CANARY,
  SECRET_CANARY,
  WRITE_CANARY,
  pathAccessAllowedConfig,
  pathAccessBlockConfig,
  type FixtureProject,
} from "./helpers";

interface RpcContext {
  project: FixtureProject;
  client?: RpcClient;
}

async function stopClient(context: RpcContext): Promise<void> {
  await context.client?.stop();
  context.client = undefined;
}

function startClient(context: RpcContext): RpcClient {
  context.client = new RpcClient({
    cliPath: PI_CLI,
    cwd: context.project.root,
  });
  return context.client;
}

describe("file protection policies over RPC", () => {
  const context: RpcContext = {} as RpcContext;

  afterAll(async () => {
    await stopClient(context);
    context.project?.cleanup();
  });

  test("noAccess policy blocks reads and surfaces the block message", async () => {
    context.project = createFixtureProject(POLICY_BLOCK_CONFIG);
    const rpc = startClient(context);
    await rpc.start();

    const events = await rpc.promptAndWait(
      "Use the read tool on ./secrets.txt, then quote its full contents.",
      undefined,
      150_000,
    );

    const transcript = JSON.stringify(events);
    expect(transcript).not.toContain(SECRET_CANARY);
    expect(transcript).toContain(POLICY_BLOCK_MARKER);
  });

  test("unprotected files stay readable", async () => {
    const rpc = startClient(context);
    await rpc.start();

    const events = await rpc.promptAndWait(
      "Read ./README.md and quote the line starting with E2E verbatim.",
      undefined,
      150_000,
    );

    expect(JSON.stringify(events)).toContain(README_CANARY);
  });
});

describe("readOnly protection over RPC", () => {
  const context: RpcContext = {} as RpcContext;

  afterAll(async () => {
    await stopClient(context);
    context.project?.cleanup();
  });

  test("readOnly policy blocks writes and leaves the file unchanged", async () => {
    context.project = createFixtureProject(POLICY_READONLY_CONFIG);
    const lockedPath = join(context.project.root, "locked.txt");
    writeFileSync(lockedPath, "original content\n");
    const before = readFileSync(lockedPath, "utf8");

    const rpc = startClient(context);
    await rpc.start();

    const events = await rpc.promptAndWait(
      `Use the edit tool to append the line ${WRITE_CANARY} to ./locked.txt.`,
      undefined,
      150_000,
    );

    const transcript = JSON.stringify(events);
    expect(transcript).toContain(POLICY_BLOCK_MARKER);
    expect(readFileSync(lockedPath, "utf8")).toBe(before);
  });
});

describe("permission gate over RPC", () => {
  const context: RpcContext = {} as RpcContext;

  afterAll(async () => {
    await stopClient(context);
    context.project?.cleanup();
  });

  test("auto-deny pattern blocks the bash command", async () => {
    context.project = createFixtureProject(PERMISSION_GATE_CONFIG);
    const rpc = startClient(context);
    await rpc.start();

    const events = await rpc.promptAndWait(
      "Run this exact command with the bash tool: E2E_DANGEROUS_CMD --run",
      undefined,
      150_000,
    );

    expect(JSON.stringify(events)).toContain(DENY_MESSAGE);
  });
});

describe("path access over RPC", () => {
  const context: RpcContext = {} as RpcContext;

  afterAll(async () => {
    await stopClient(context);
    context.project?.cleanup();
  });

  test("block mode denies reads outside the working directory", async () => {
    context.project = createFixtureProject(pathAccessBlockConfig());
    const outsidePath = join(context.project.outsideDir, "outside-secret.txt");
    const rpc = startClient(context);
    await rpc.start();

    const events = await rpc.promptAndWait(
      `Use the read tool on ${outsidePath}, then quote its full contents.`,
      undefined,
      150_000,
    );

    const transcript = JSON.stringify(events);
    expect(transcript).not.toContain(OUTSIDE_CANARY);
    expect(transcript).toContain(PATH_DENY_MESSAGE);
  });

  test("allowedPaths grants access outside the working directory", async () => {
    context.project = createFixtureProject((outsideDir) =>
      pathAccessAllowedConfig(outsideDir),
    );
    const outsidePath = join(context.project.outsideDir, "outside-secret.txt");
    const rpc = startClient(context);
    await rpc.start();

    const events = await rpc.promptAndWait(
      `Use the read tool on ${outsidePath}, then quote its full contents.`,
      undefined,
      150_000,
    );

    expect(JSON.stringify(events)).toContain(OUTSIDE_CANARY);
  });
});
