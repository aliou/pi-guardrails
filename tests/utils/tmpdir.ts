import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test as baseTest } from "vitest";

export const tmpdirTest = baseTest.extend<{ tmpdir: string }>({
  // biome-ignore lint/correctness/noEmptyPattern: Vitest fixture API requires destructuring first arg
  tmpdir: async ({}, use) => {
    const directory = await mkdtemp(join(tmpdir(), "vitest-"));
    await use(directory);
    await rm(directory, { recursive: true, force: true });
  },
});
