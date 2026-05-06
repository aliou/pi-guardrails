export {
  CURRENT_VERSION,
  normalizeAllowedPaths,
} from "../../../src/shared/config/migration";
export {
  run as migrateV0,
  shouldRun as needsMigration,
} from "../../../src/shared/config/migration/001-v0-format-upgrade";
export {
  run as migrateEnvFilesToPolicies,
  shouldRun as needsEnvFilesToPoliciesMigration,
} from "../../../src/shared/config/migration/004-env-files-to-policies";
export {
  run as migrateAllowedPaths,
  shouldRun as needsAllowedPathsMigration,
} from "../../../src/shared/config/migration/005-normalize-allowed-paths";
export {
  run as migrateApplyBuiltinDefaults,
  shouldRun as needsApplyBuiltinDefaultsMigration,
} from "../../../src/shared/config/migration/006-apply-builtin-defaults";
export {
  run as migrateMarkOnboardingDone,
  shouldRun as needsOnboardingDoneMigration,
} from "../../../src/shared/config/migration/007-mark-onboarding-done";
