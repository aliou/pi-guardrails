/**
 * Wrapper around pi-coding-agent's internal `loadExtensionFromFactory`.
 *
 * This function is not part of the package's public API (the `exports` field
 * only exposes "." and "./hooks"). We import the compiled JS directly by
 * absolute path and re-export it from this single module so that only one
 * place needs updating if the internal path changes upstream.
 *
 * Vitest resolves this via the `resolve.alias` entry in vitest.config.ts.
 */
export { loadExtensionFromFactory } from "#pi-internal/extensions-loader";
