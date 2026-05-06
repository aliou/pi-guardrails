export type {
  DangerousPattern,
  GuardrailsConfig,
  PathAccessConfig,
  PathAccessMode,
  PatternConfig,
  PolicyRule,
  Protection,
  ResolvedConfig,
} from "../../src/shared/config";
export {
  CURRENT_VERSION,
  configLoader,
  DEFAULT_CONFIG,
  globalConfigMigrations,
  migrations,
  normalizeAllowedPaths,
} from "../../src/shared/config";
