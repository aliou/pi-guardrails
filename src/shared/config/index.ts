export { DEFAULT_CONFIG } from "./defaults";
export { configLoader } from "./loader";
export {
  CURRENT_VERSION,
  globalConfigMigrations,
  migrations,
} from "./migration";
export type {
  AllowedPath,
  DangerousPattern,
  GuardrailsConfig,
  PathAccessConfig,
  PathAccessMode,
  PatternConfig,
  PolicyRule,
  Protection,
  ResolvedConfig,
} from "./types";
