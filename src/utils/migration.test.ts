import { describe, expect, it } from "vitest";
import type { GuardrailsConfig } from "../config";
import {
  CURRENT_VERSION,
  migrateDirectoryAccess,
  needsDirectoryAccessMigration,
} from "./migration";

describe("needsDirectoryAccessMigration", () => {
  it("returns true when no directoryAccess and onboarding completed", () => {
    const config: GuardrailsConfig = {
      onboarding: { completed: true },
    };
    expect(needsDirectoryAccessMigration(config)).toBe(true);
  });

  it("returns false when directoryAccess already present", () => {
    const config: GuardrailsConfig = {
      directoryAccess: { mode: "allow", additionalDirs: [] },
      onboarding: { completed: true },
    };
    expect(needsDirectoryAccessMigration(config)).toBe(false);
  });

  it("returns false when onboarding not completed", () => {
    const config: GuardrailsConfig = {
      onboarding: { completed: false },
    };
    expect(needsDirectoryAccessMigration(config)).toBe(false);
  });

  it("returns false when no onboarding field", () => {
    const config: GuardrailsConfig = {};
    expect(needsDirectoryAccessMigration(config)).toBe(false);
  });

  it("returns false when directoryAccess present even without onboarding", () => {
    const config: GuardrailsConfig = {
      directoryAccess: { mode: "block", additionalDirs: [] },
    };
    expect(needsDirectoryAccessMigration(config)).toBe(false);
  });
});

describe("migrateDirectoryAccess", () => {
  it("sets features.directoryAccess to false", () => {
    const config: GuardrailsConfig = {
      onboarding: { completed: true },
    };
    const result = migrateDirectoryAccess(config);
    expect(result.features?.directoryAccess).toBe(false);
  });

  it("sets mode to allow to preserve existing behavior", () => {
    const config: GuardrailsConfig = {
      onboarding: { completed: true },
    };
    const result = migrateDirectoryAccess(config);
    expect(result.directoryAccess?.mode).toBe("allow");
  });

  it("sets empty additionalDirs", () => {
    const config: GuardrailsConfig = {
      onboarding: { completed: true },
    };
    const result = migrateDirectoryAccess(config);
    expect(result.directoryAccess?.additionalDirs).toEqual([]);
  });

  it("bumps version to CURRENT_VERSION", () => {
    const config: GuardrailsConfig = {
      version: "0.1.0",
      onboarding: { completed: true },
    };
    const result = migrateDirectoryAccess(config);
    expect(result.version).toBe(CURRENT_VERSION);
  });

  it("preserves existing features", () => {
    const config: GuardrailsConfig = {
      features: { policies: true, permissionGate: false },
      onboarding: { completed: true },
    };
    const result = migrateDirectoryAccess(config);
    expect(result.features?.policies).toBe(true);
    expect(result.features?.permissionGate).toBe(false);
    expect(result.features?.directoryAccess).toBe(false);
  });

  it("does not mutate the original config", () => {
    const config: GuardrailsConfig = {
      features: { policies: true },
      onboarding: { completed: true },
    };
    const clone = structuredClone(config);
    migrateDirectoryAccess(config);
    expect(config).toEqual(clone);
  });
});
