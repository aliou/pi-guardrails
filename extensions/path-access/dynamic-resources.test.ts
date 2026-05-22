import { join, resolve } from "node:path";
import {
  getDocsPath,
  getExamplesPath,
  getReadmePath,
} from "@earendil-works/pi-coding-agent";
import { describe, expect, it } from "vitest";
import { piDocumentationPaths } from "./dynamic-resources";

function withTrailingSlash(p: string): string {
  return p.endsWith("/") ? p : `${p}/`;
}

describe("piDocsAllowedPaths", () => {
  it("returns README, docs, and examples paths from the running Pi runtime", () => {
    expect(piDocumentationPaths()).toEqual([
      getReadmePath(),
      withTrailingSlash(getDocsPath()),
      withTrailingSlash(getExamplesPath()),
    ]);
  });

  it("resolves readme and directories under the same package root", () => {
    const [readme, docs, examples] = piDocumentationPaths();
    const packageRoot = resolve(join(getReadmePath(), ".."));

    expect(readme).toBe(join(packageRoot, "README.md"));
    expect(docs).toBe(`${join(packageRoot, "docs")}/`);
    expect(examples).toBe(`${join(packageRoot, "examples")}/`);
  });

  it("always emits trailing slashes on directory paths", () => {
    const [, docs, examples] = piDocumentationPaths();
    expect(docs.endsWith("/")).toBe(true);
    expect(examples.endsWith("/")).toBe(true);
  });

  it("honors PI_PACKAGE_DIR override (Nix/Guix store paths)", () => {
    const original = process.env.PI_PACKAGE_DIR;
    const fakeRoot = "/tmp/pi-fake-package-dir";
    process.env.PI_PACKAGE_DIR = fakeRoot;
    try {
      const [readme, docs, examples] = piDocumentationPaths();

      expect(readme).toBe(resolve(join(fakeRoot, "README.md")));
      expect(docs).toBe(`${resolve(join(fakeRoot, "docs"))}/`);
      expect(examples).toBe(`${resolve(join(fakeRoot, "examples"))}/`);
    } finally {
      if (original === undefined) {
        delete process.env.PI_PACKAGE_DIR;
      } else {
        process.env.PI_PACKAGE_DIR = original;
      }
    }
  });

  it("returns exactly three entries", () => {
    expect(piDocumentationPaths()).toHaveLength(3);
  });
});
