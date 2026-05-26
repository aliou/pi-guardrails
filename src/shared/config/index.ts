export { DEFAULT_CONFIG } from "./defaults";
export { configLoader } from "./loader";
export {
  CURRENT_VERSION,
  globalConfigMigrations,
  migrations,
} from "./migration";
export type {
  DangerousPattern,
  GuardrailsConfig,
  IgnoredBashArgRule,
  PathAccessConfig,
  PathAccessMode,
  PatternConfig,
  PolicyRule,
  Protection,
  ResolvedConfig,
} from "./types";
