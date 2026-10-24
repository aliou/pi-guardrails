import { describe, expect, it } from "vitest";
import { classifyInvocation, commandFamily } from "./index";
import { roleCandidates, wordsOf } from "./test-helpers";

function roles(source: string): string[] {
  const { name, args } = wordsOf(source);
  return classifyInvocation(name, args).map((cw) => cw.role);
}

describe("agent-cli family", () => {
  it("maps pi to the agent-cli family", () => {
    expect(commandFamily("pi")).toBe("agent-cli");
    expect(commandFamily("/usr/local/bin/pi")).toBe("agent-cli");
  });

  it("classifies the pi -p prompt as text", () => {
    expect(roles("pi -p '/skill:workflow-standard do nothing'")).toEqual([
      "none",
      "option-value",
    ]);
  });

  it.each([
    ["pi -p '/skill:workflow-standard do nothing'"],
    ["pi --print '/skill:workflow-standard do nothing'"],
    ["pi '/skill:workflow-standard do nothing'"],
    ["pi -p --model sonnet /skill:review"],
    ["pi -p -- '/tmp is full, explain'"],
    ["pi --unknown-flag /skill:review"],
  ])("yields no path candidates for prompt text: %j", (command) => {
    expect(roleCandidates(command)).toEqual([]);
  });

  it("keeps @file arguments as candidates", () => {
    expect(roleCandidates("pi -p @/etc/hosts 'summarize'")).toEqual([
      "@/etc/hosts",
    ]);
  });

  it("keeps values of path options as candidates", () => {
    expect(
      roleCandidates("pi -e /opt/ext.ts --session /tmp/s.jsonl -p hi"),
    ).toEqual(["/opt/ext.ts", "/tmp/s.jsonl"]);
  });

  it("keeps legacy operands for subcommands", () => {
    expect(roles("pi install /opt/ext")).toEqual(["operand", "operand"]);
  });

  it("leaves unknown agent CLIs on the legacy fallback", () => {
    expect(commandFamily("not-pi")).toBe("generic");
    expect(roleCandidates("not-pi -p '/skill:x do it'")).toEqual([
      "-p",
      "/skill:x do it",
    ]);
  });
});
