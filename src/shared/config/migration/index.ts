import type { Migration } from "@aliou/pi-utils-settings";
import type { GuardrailsConfig } from "../types";
import * as v0FormatUpgrade from "./001-v0-format-upgrade";
import * as stripToolchainFields from "./002-strip-toolchain-fields";
import * as stripCommandExplainerFields from "./003-strip-command-explainer-fields";
import * as envFilesToPolicies from "./004-env-files-to-policies";
import * as normalizeAllowedPaths from "./005-normalize-allowed-paths";
import * as applyBuiltinDefaults from "./006-apply-builtin-defaults";
import * as markOnboardingDone from "./007-mark-onboarding-done";

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
  },
  {
    name: "strip-command-explainer-fields",
    shouldRun: stripCommandExplainerFields.shouldRun,
    run: stripCommandExplainerFields.run,
  },
  {
    name: "envFiles-to-policies",
    shouldRun: envFilesToPolicies.shouldRun,
    run: envFilesToPolicies.run,
  },
  {
    name: "normalize-allowed-paths",
    shouldRun: normalizeAllowedPaths.shouldRun,
    run: normalizeAllowedPaths.run,
  },
];

export const globalConfigMigrations = [
  applyBuiltinDefaults,
  markOnboardingDone,
] as const;
