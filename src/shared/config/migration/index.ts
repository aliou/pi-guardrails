import type {
  Migration,
  MigrationContext,
  MigrationMessageFactory,
} from "@aliou/pi-utils-settings";
import type { GuardrailsConfig } from "../types";
import * as v0FormatUpgrade from "./001-v0-format-upgrade";
import * as stripToolchainFields from "./002-strip-toolchain-fields";
import * as stripCommandExplainerFields from "./003-strip-command-explainer-fields";
import * as envFilesToPolicies from "./004-env-files-to-policies";
import * as normalizeAllowedPaths from "./005-normalize-allowed-paths";
import * as applyBuiltinDefaults from "./006-apply-builtin-defaults";
import * as markOnboardingDone from "./007-mark-onboarding-done";
import * as normalizeStringBooleans from "./008-normalize-string-booleans";
import * as allowDevNull from "./009-allow-dev-null";
import * as allowedPathsObjects from "./010-allowed-paths-objects";
import * as normalizeVersionStamp from "./011-normalize-version-stamp";

interface MigrationModule<TConfig> {
  version: string;
  shouldRun(config: TConfig): boolean;
  run(
    config: TConfig,
    filePath: string,
    ctx: MigrationContext,
  ): Promise<TConfig> | TConfig;
}

interface CompositeEntry<TConfig> {
  mod: MigrationModule<TConfig>;
  message?: string | MigrationMessageFactory<TConfig>;
}

function composeMigrations(
  name: string,
  version: string,
  subs: CompositeEntry<GuardrailsConfig>[],
): Migration<GuardrailsConfig> {
  const shouldRun: Migration<GuardrailsConfig>["shouldRun"] = (config) =>
    subs.some((sub) => sub.mod.shouldRun(config));

  const run: Migration<GuardrailsConfig>["run"] = async (
    config,
    filePath,
    ctx,
  ) => {
    let current = config;
    for (const sub of subs) {
      if (sub.mod.shouldRun(current)) {
        current = await sub.mod.run(current, filePath, ctx);
      }
    }
    return current;
  };

  const message: MigrationMessageFactory<GuardrailsConfig> = (
    before,
    after,
    filePath,
    ctx,
  ) => {
    const parts: string[] = [];
    for (const sub of subs) {
      if (!sub.mod.shouldRun(before) || !sub.message) continue;
      const part =
        typeof sub.message === "function"
          ? sub.message(before, after, filePath, ctx)
          : sub.message;
      if (part) parts.push(part);
    }
    return parts.length > 0 ? parts.join("\n\n") : undefined;
  };

  return { name, version, shouldRun, run, message };
}

export const migrations: Migration<GuardrailsConfig>[] = [
  composeMigrations("v0.12.0-migrations", "0.12.0", [
    { mod: v0FormatUpgrade },
    {
      mod: stripToolchainFields,
      message:
        "preventBrew, preventPython, enforcePackageManager, and packageManager " +
        "have been removed from guardrails and moved to @aliou/pi-toolchain. " +
        "These fields will be stripped from your config.",
    },
    {
      mod: stripCommandExplainerFields,
      message:
        "permissionGate.explainCommands, explainModel, and explainTimeout " +
        "have been removed. These fields will be stripped from your config.",
    },
    { mod: envFilesToPolicies, message: envFilesToPolicies.message },
    {
      mod: normalizeAllowedPaths,
      message:
        "pathAccess.allowedPaths was migrated from pattern objects to path strings.",
    },
  ]),
  {
    name: "normalize-string-booleans",
    version: normalizeStringBooleans.version,
    shouldRun: normalizeStringBooleans.shouldRun,
    run: normalizeStringBooleans.run,
    message:
      "Config migrated: boolean settings stored as strings were converted to true/false.",
  },
  composeMigrations("v0.14.0-path-access-migrations", "0.14.0", [
    {
      mod: allowDevNull,
      message:
        "pathAccess.allowedPaths was migrated to allow /dev/null by default.",
    },
    {
      mod: allowedPathsObjects,
      message:
        "pathAccess.allowedPaths was migrated from path strings to { kind, path } objects.",
    },
  ]),
  {
    name: "normalize-version-stamp",
    version: normalizeVersionStamp.version,
    shouldRun: normalizeVersionStamp.shouldRun,
    run: normalizeVersionStamp.run,
  },
];

export const globalConfigMigrations = [
  applyBuiltinDefaults,
  markOnboardingDone,
] as const;
