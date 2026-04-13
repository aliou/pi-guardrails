/**
 * Type declarations for the internal pi-coding-agent module aliased via
 * vitest.config.ts. This mirrors the exports of
 * `@mariozechner/pi-coding-agent/dist/core/extensions/loader.js`.
 */
declare module "#pi-internal/extensions-loader" {
  import type {
    EventBus,
    Extension,
    ExtensionFactory,
    ExtensionRuntime,
  } from "@mariozechner/pi-coding-agent";

  export function loadExtensionFromFactory(
    factory: ExtensionFactory,
    cwd: string,
    eventBus: EventBus,
    runtime: ExtensionRuntime,
    extensionPath?: string,
  ): Promise<Extension>;
}
