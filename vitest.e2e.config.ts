import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["e2e/**/*.test.ts"],
    testTimeout: 180_000,
    hookTimeout: 60_000,
    mockReset: true,
  },
});
