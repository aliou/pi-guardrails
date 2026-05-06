export { DEFAULT_CONFIG } from "./defaults";
export { configLoader } from "./loader";
export {
  CURRENT_VERSION,
  globalConfigMigrations,
  migrations,
  normalizeAllowedPaths,
} from "./migration";
export type {
  DangerousPattern,
  GuardrailsConfig,
  PathAccessConfig,
  PathAccessMode,
  PatternConfig,
  PolicyRule,
  Protection,
  ResolvedConfig,
} from "./types";
