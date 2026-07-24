import { beforeEach, vi } from "vitest";
import { vol } from "memfs";
import "./utils/matchers";

vi.mock("node:fs");
vi.mock("node:fs/promises");

beforeEach(() => {
  vol.reset();
});
