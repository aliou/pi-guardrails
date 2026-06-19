import type { Migration } from "@aliou/pi-utils-settings";
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

export { CURRENT_VERSION } from "./version";

export const migrations: Migration<GuardrailsConfig>[] = [
  {
    name: "v0-format-upgrade",
    shouldRun: v0FormatUpgrade.shouldRun,
    run: v0FormatUpgrade.run,
  },
  {
    name: "strip-toolchain-fields",
    shouldRun: stripToolchainFields.shouldRun,
    run: stripToolchainFields.run,
    message:
      "preventBrew, preventPython, enforcePackageManager, and packageManager " +
      "have been removed from guardrails and moved to @aliou/pi-toolchain. " +
      "These fields will be stripped from your config.",
  },
  {
    name: "strip-command-explainer-fields",
    shouldRun: stripCommandExplainerFields.shouldRun,
    run: stripCommandExplainerFields.run,
    message:
      "permissionGate.explainCommands, explainModel, and explainTimeout " +
      "have been removed. These fields will be stripped from your config.",
  },
  {
    name: "env-files-to-policies",
    shouldRun: envFilesToPolicies.shouldRun,
    run: envFilesToPolicies.run,
    message: envFilesToPolicies.message,
  },
  {
    name: "normalize-allowed-paths",
    shouldRun: normalizeAllowedPaths.shouldRun,
    run: normalizeAllowedPaths.run,
    message:
      "pathAccess.allowedPaths was migrated from pattern objects to path strings.",
  },
  {
    name: "normalize-string-booleans",
    shouldRun: normalizeStringBooleans.shouldRun,
    run: normalizeStringBooleans.run,
    message:
      "Config migrated: boolean settings stored as strings were converted to true/false.",
  },
  {
    name: "allow-dev-null",
    shouldRun: allowDevNull.shouldRun,
    run: allowDevNull.run,
    message:
      "pathAccess.allowedPaths was migrated to allow /dev/null by default.",
  },
  {
    name: "allowed-paths-objects",
    shouldRun: allowedPathsObjects.shouldRun,
    run: allowedPathsObjects.run,
    message:
      "pathAccess.allowedPaths was migrated from path strings to { kind, path } objects.",
  },
];

export const globalConfigMigrations = [
  applyBuiltinDefaults,
  markOnboardingDone,
] as const;
