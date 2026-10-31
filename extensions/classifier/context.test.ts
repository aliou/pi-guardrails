import { describe, expect, it } from "vitest";
import { type ContextMessage, collectTaskContext } from "./context";

function user(text: string): ContextMessage {
  return { role: "user", content: text };
}

describe("collectTaskContext", () => {
  it("returns no requests for an empty session", () => {
    expect(collectTaskContext([])).toEqual({ userRequests: [] });
  });

  it("keeps user requests in chronological order", () => {
    const context = collectTaskContext([
      user("first request"),
      { role: "assistant", content: [{ type: "text", text: "thinking" }] },
      user("second request"),
    ]);
    expect(context.userRequests).toEqual(["first request", "second request"]);
  });

  it("uses the most recent assistant text as the agent claim", () => {
    const context = collectTaskContext([
      {
        role: "assistant",
        content: [{ type: "text", text: "old plan" }],
      },
      user("do the thing"),
      {
        role: "assistant",
        content: [
          { type: "thinking", text: "hidden" },
          { type: "text", text: "I will delete the build output." },
        ],
      },
    ]);
    expect(context.agentClaim).toBe("I will delete the build output.");
  });

  it("ignores tool results and non-text blocks", () => {
    const context = collectTaskContext([
      user("only request"),
      {
        role: "toolResult",
        content: [{ type: "text", text: "tool output" }],
      },
      {
        role: "user",
        content: [{ type: "image" }, { type: "text", text: "with an image" }],
      },
    ]);
    expect(context.userRequests).toEqual(["only request", "with an image"]);
  });

  it("keeps the newest requests within the char budget", () => {
    const context = collectTaskContext(
      [user("a".repeat(50)), user("b".repeat(50)), user("c".repeat(50))],
      { maxTotalChars: 60, maxMessageChars: 50 },
    );
    expect(context.userRequests).toHaveLength(2);
    expect(context.userRequests[1]?.startsWith("c")).toBe(true);
    expect(context.userRequests.every((request) => request.length <= 50)).toBe(
      true,
    );
  });

  it("limits the number of user requests", () => {
    const messages = Array.from({ length: 10 }, (_, index) =>
      user(`request ${index}`),
    );
    const context = collectTaskContext(messages, { maxUserMessages: 3 });
    expect(context.userRequests).toEqual([
      "request 7",
      "request 8",
      "request 9",
    ]);
  });

  it("truncates long messages with an ellipsis", () => {
    const context = collectTaskContext([user("x".repeat(100))], {
      maxMessageChars: 10,
    });
    expect(context.userRequests[0]).toBe("xxxxxxxxx…");
  });
});
