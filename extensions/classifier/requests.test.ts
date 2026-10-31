import { describe, expect, it } from "vitest";
import { buildClassifierRequest, UNTRUSTED_NOTE } from "./requests";

describe("buildClassifierRequest", () => {
  it("describes a bash command", () => {
    const request = buildClassifierRequest({
      action: { kind: "command", command: "rm -rf build" },
      toolName: "bash",
      cwd: "/workspace",
      userRequests: ["clean the build"],
      agentClaim: "Removing build output.",
      flaggedReason: "recursive force delete",
    });

    expect(request.state).toEqual({
      action: {
        kind: "bash command",
        tool: "bash",
        command: "rm -rf build",
        cwd: "/workspace",
      },
      task_context: {
        user_requests: ["clean the build"],
        task_context_available: true,
        agent_claim: "Removing build output.",
      },
      guardrail_flag: "recursive force delete",
      data_handling: UNTRUSTED_NOTE,
    });
    expect(Object.keys(request.questions)).toEqual([
      "context_sufficiency",
      "authorization",
      "impact",
    ]);
    expect(request.questions.authorization?.instructions).toContain(
      "bash command",
    );
  });

  it("describes a file access and marks missing task context", () => {
    const request = buildClassifierRequest({
      action: { kind: "file", path: "/etc/hosts" },
      toolName: "read",
      cwd: "/workspace",
      userRequests: [],
      flaggedReason: "outside workspace",
    });

    expect(request.state.action).toEqual({
      kind: "file access",
      tool: "read",
      path: "/etc/hosts",
      cwd: "/workspace",
    });
    expect(request.state.task_context).toEqual({
      user_requests: ["(none provided)"],
      task_context_available: false,
      agent_claim: "(none provided)",
    });
    expect(request.questions.impact?.instructions).toContain("file access");
  });
});
