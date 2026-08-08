import type { GuardrailsConfig } from "../types";

export const version = "0.16.2";

export function shouldRun(config: GuardrailsConfig): boolean {
  return !config.version || config.version < "0.16.2";
}

export function run(config: GuardrailsConfig): GuardrailsConfig {
  return config;
}
