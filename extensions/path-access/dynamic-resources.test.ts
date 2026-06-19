import { join, resolve } from "node:path";
import {
  getDocsPath,
  getExamplesPath,
  getReadmePath,
} from "@earendil-works/pi-coding-agent";
import { describe, expect, it } from "vitest";
import { piDocumentationPaths } from "./dynamic-resources";

describe("piDocumentationPaths", () => {
  it("returns README as a file grant and docs/examples as directory grants", () => {
    expect(piDocumentationPaths()).toEqual([
      { kind: "file", path: getReadmePath() },
      { kind: "directory", path: getDocsPath() },
      { kind: "directory", path: getExamplesPath() },
    ]);
  });

  it("resolves readme and directories under the same package root", () => {
    const [readme, docs, examples] = piDocumentationPaths();
    const packageRoot = resolve(join(getReadmePath(), ".."));

    expect(readme).toEqual({
      kind: "file",
      path: join(packageRoot, "README.md"),
    });
    expect(docs).toEqual({
      kind: "directory",
      path: join(packageRoot, "docs"),
    });
    expect(examples).toEqual({
      kind: "directory",
      path: join(packageRoot, "examples"),
    });
  });

  it("carries kind explicitly instead of relying on trailing slashes", () => {
    const [readme, docs, examples] = piDocumentationPaths();
    expect(readme.kind).toBe("file");
    expect(docs.kind).toBe("directory");
    expect(examples.kind).toBe("directory");
  });

  it("honors PI_PACKAGE_DIR override (Nix/Guix store paths)", () => {
    const original = process.env.PI_PACKAGE_DIR;
    const fakeRoot = "/tmp/pi-fake-package-dir";
    process.env.PI_PACKAGE_DIR = fakeRoot;
    try {
      const [readme, docs, examples] = piDocumentationPaths();

      expect(readme).toEqual({
        kind: "file",
        path: resolve(join(fakeRoot, "README.md")),
      });
      expect(docs).toEqual({
        kind: "directory",
        path: resolve(join(fakeRoot, "docs")),
      });
      expect(examples).toEqual({
        kind: "directory",
        path: resolve(join(fakeRoot, "examples")),
      });
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
