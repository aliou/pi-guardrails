import { describe, expect, it } from "vitest";
import {
  compileCommandPattern,
  compileFilePattern,
  normalizeFilePath,
} from "./matching";

describe("normalizeFilePath", () => {
  it.each([
    ["./src//file.ts", "src/file.ts"],
    ["src\\file.ts", "src/file.ts"],
    ["./foo\\bar//baz", "foo/bar/baz"],
  ])("normalizes %s", (input, expected) => {
    expect(normalizeFilePath(input)).toBe(expected);
  });
});

describe("compileFilePattern", () => {
  it("matches basename when the pattern has no slash", () => {
    const pattern = compileFilePattern({ pattern: ".env" });

    expect(pattern.test(".env")).toBe(true);
    expect(pattern.test("config/.env")).toBe(true);
    expect(pattern.test("config/.env.local")).toBe(false);
  });

  it("matches full normalized paths when the pattern has a slash", () => {
    const pattern = compileFilePattern({ pattern: "config/*.env" });

    expect(pattern.test("config/app.env")).toBe(true);
    expect(pattern.test("./config//app.env")).toBe(true);
    expect(pattern.test("nested/config/app.env")).toBe(false);
  });

  it("uses case-insensitive regex matching for file patterns", () => {
    const pattern = compileFilePattern({
      pattern: "SECRET\\.TXT$",
      regex: true,
    });

    expect(pattern.test("docs/secret.txt")).toBe(true);
    expect(pattern.test("docs/public.txt")).toBe(false);
  });

  it("returns a non-matching pattern for invalid regex", () => {
    const pattern = compileFilePattern({ pattern: "[", regex: true });

    expect(pattern.test("anything")).toBe(false);
  });
});

describe("compileCommandPattern", () => {
  it("uses substring matching by default", () => {
    const pattern = compileCommandPattern({ pattern: "deploy production" });

    expect(pattern.test("please deploy production now")).toBe(true);
    expect(pattern.test("deploy staging")).toBe(false);
  });

  it("uses regex matching when requested", () => {
    const pattern = compileCommandPattern({
      pattern: "terraform\\s+apply",
      regex: true,
    });

    expect(pattern.test("terraform apply -auto-approve")).toBe(true);
    expect(pattern.test("terraform plan")).toBe(false);
  });

  it("returns a non-matching pattern for invalid regex", () => {
    const pattern = compileCommandPattern({ pattern: "[", regex: true });

    expect(pattern.test("anything")).toBe(false);
  });
});
