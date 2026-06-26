import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: [
      "src/**/*.test.ts",
      "extensions/**/*.test.ts",
      "tests/**/*.test.ts",
    ],
    setupFiles: ["./tests/vitest.setup.ts"],
    mockReset: true,
  },
});
