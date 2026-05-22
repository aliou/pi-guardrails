/**
 * Resolve Pi documentation paths dynamically from the running Pi runtime.
 *
 * Pi bakes its docs/examples paths into the system prompt text at launch time,
 * but those paths change between Pi versions (e.g. Nix store hashes), so we
 * resolve them directly from Pi's package asset path helpers instead of
 * scraping the system prompt or persisting concrete paths in config.
 */
import {
  getDocsPath,
  getExamplesPath,
  getReadmePath,
} from "@earendil-works/pi-coding-agent";

function withTrailingSlash(p: string): string {
  return p.endsWith("/") ? p : `${p}/`;
}

/**
 * Resolve Pi documentation paths dynamically from the running Pi runtime.
 *
 * Pi bakes its docs/examples paths into the system prompt text at launch time,
 * but those paths change between Pi versions (e.g. Nix store hashes), so we
 * resolve them directly from Pi's package asset path helpers instead of
 * scraping the system prompt or persisting concrete paths in config.
 *
 * These helpers honor `PI_PACKAGE_DIR` (Nix/Guix) and walk to the package
 * root for npm global installs and Bun binaries, so they always match the
 * Pi version actually running. They depend only on the process environment
 * and are fixed for the process lifetime — resolve once, no per-turn work.
 *
 * Directories include a trailing slash for path-access matching convention.
 */
export function piDocumentationPaths(): string[] {
  return [
    getReadmePath(),
    withTrailingSlash(getDocsPath()),
    withTrailingSlash(getExamplesPath()),
  ];
}
