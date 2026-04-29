import { describe, expect, it } from "vitest";
import type { GuardrailsConfig } from "../config";
import {
  migrateAllowedPaths,
  needsAllowedPathsMigration,
  normalizeAllowedPaths,
} from "./migration";

describe("allowedPaths migration", () => {
  it("normalizes strings and legacy pattern objects", () => {
    expect(
      normalizeAllowedPaths([
        "/dev/null",
        { pattern: "~/Downloads/" },
        { pattern: " /tmp/file " },
        { pattern: "" },
        { regex: true },
        42,
        null,
        "/dev/null",
      ]),
    ).toEqual(["/dev/null", "~/Downloads/", "/tmp/file"]);
  });

  it("detects legacy object-shaped allowed paths", () => {
    const config = {
      pathAccess: {
        allowedPaths: [{ pattern: "/dev/null" }],
      },
    } as unknown as GuardrailsConfig;

    expect(needsAllowedPathsMigration(config)).toBe(true);
  });

  it("does not migrate valid string allowed paths", () => {
    const config: GuardrailsConfig = {
      pathAccess: {
        allowedPaths: ["/dev/null"],
      },
    };

    expect(needsAllowedPathsMigration(config)).toBe(false);
  });

  it("converts legacy object-shaped allowed paths to strings", () => {
    const config = {
      pathAccess: {
        mode: "block",
        allowedPaths: [{ pattern: "/dev/null" }, "~/Downloads/"],
      },
    } as unknown as GuardrailsConfig;

    expect(migrateAllowedPaths(config).pathAccess?.allowedPaths).toEqual([
      "/dev/null",
      "~/Downloads/",
    ]);
  });
});
