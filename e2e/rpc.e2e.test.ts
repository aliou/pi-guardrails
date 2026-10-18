import { RpcClient } from "@earendil-works/pi-coding-agent";
import { afterAll, afterEach, beforeAll, describe, expect, test } from "vitest";
import {
  BLOCK_MARKER,
  createFixtureProject,
  PI_CLI,
  README_CANARY,
  SECRET_CANARY,
  type FixtureProject,
} from "./helpers";

describe("guardrails RPC e2e", () => {
  let project: FixtureProject;
  let client: RpcClient | undefined;

  beforeAll(() => {
    project = createFixtureProject();
  });

  afterAll(() => {
    project.cleanup();
  });

  afterEach(async () => {
    await client?.stop();
    client = undefined;
  });

  function startClient(): RpcClient {
    client = new RpcClient({
      cliPath: PI_CLI,
      cwd: project.root,
    });
    return client;
  }

  test("policy blocks reads of a protected file and surfaces the block message", async () => {
    const rpc = startClient();
    await rpc.start();

    const events = await rpc.promptAndWait(
      "Use the read tool on ./secrets.txt, then quote its full contents.",
      undefined,
      150_000,
    );

    const transcript = JSON.stringify(events);
    expect(transcript).not.toContain(SECRET_CANARY);
    expect(transcript).toContain(BLOCK_MARKER);
  });

  test("unprotected files stay readable", async () => {
    const rpc = startClient();
    await rpc.start();

    const events = await rpc.promptAndWait(
      "Read ./README.md and quote the line starting with E2E verbatim.",
      undefined,
      150_000,
    );

    expect(JSON.stringify(events)).toContain(README_CANARY);
  });
});
