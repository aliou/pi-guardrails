import { describe, expect, it, vi } from "vitest";

// Oh My Pi's legacy shim does not export these helpers.
vi.mock("@earendil-works/pi-coding-agent", () => ({
  getReadmePath: undefined,
  getDocsPath: undefined,
  getExamplesPath: undefined,
}));

const { piDocumentationPaths } = await import("./dynamic-resources");

describe("piDocumentationPaths OMP compatibility", () => {
  it("returns an empty array when the helpers are not exported", () => {
    expect(piDocumentationPaths()).toEqual([]);
  });
});
