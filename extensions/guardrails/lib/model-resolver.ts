/**
 * Model resolution helper for subagents.
 *
 * Resolves a model by provider + ID from the model registry.
 */

import type { Model } from "@mariozechner/pi-ai";
import type { ExtensionContext } from "@mariozechner/pi-coding-agent";

/**
 * Find a model by provider and ID.
 *
 * @param provider - Provider name (e.g., "openrouter", "anthropic", "openai-codex")
 * @param modelId - Model ID (e.g., "anthropic/claude-haiku-4.5")
 * @param ctx - Extension context with modelRegistry
 * @returns The resolved model
 * @throws Error if model not found or API key not configured
 */
export function resolveModel(
  provider: string,
  modelId: string,
  ctx: ExtensionContext,
  // biome-ignore lint/suspicious/noExplicitAny: Model type requires any for generic API
): Model<any> {
  const available = ctx.modelRegistry.getAvailable();
  const model = available.find(
    (m) => m.id === modelId && m.provider === provider,
  );

  if (model) {
    return model;
  }

  // Check if the model exists but the API key is missing
  const all = ctx.modelRegistry.getAll();
  const existsWithoutKey = all.some(
    (m) => m.id === modelId && m.provider === provider,
  );

  if (existsWithoutKey) {
    throw new Error(
      `Model "${modelId}" exists on ${provider} but no valid API key is configured.`,
    );
  }

  throw new Error(`Model "${modelId}" not found on provider "${provider}".`);
}
