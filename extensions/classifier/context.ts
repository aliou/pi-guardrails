export interface ContextContentBlock {
  type?: string;
  text?: string;
}

export interface ContextMessage {
  role: string;
  content?: string | readonly ContextContentBlock[];
}

export interface TaskContext {
  userRequests: string[];
  agentClaim?: string;
}

export interface CollectOptions {
  maxUserMessages?: number;
  maxMessageChars?: number;
  maxTotalChars?: number;
}

const DEFAULTS = {
  maxUserMessages: 6,
  maxMessageChars: 600,
  maxTotalChars: 2400,
} as const;

function messageText(message: ContextMessage): string {
  if (!message.content) return "";
  if (typeof message.content === "string") return message.content.trim();
  const parts: string[] = [];
  for (const block of message.content) {
    if (block?.type === "text" && typeof block.text === "string") {
      parts.push(block.text);
    }
  }
  return parts.join("\n").trim();
}

function clip(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

export function collectTaskContext(
  messages: readonly ContextMessage[],
  options: CollectOptions = {},
): TaskContext {
  const maxUserMessages = options.maxUserMessages ?? DEFAULTS.maxUserMessages;
  const maxMessageChars = options.maxMessageChars ?? DEFAULTS.maxMessageChars;
  const maxTotalChars = options.maxTotalChars ?? DEFAULTS.maxTotalChars;

  const newestFirst: string[] = [];
  let agentClaim: string | undefined;
  let budget = maxTotalChars;

  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (!message) continue;
    if (message.role !== "user" && message.role !== "assistant") continue;

    const text = messageText(message);
    if (!text) continue;

    if (message.role === "assistant") {
      if (!agentClaim) agentClaim = clip(text, maxMessageChars);
      continue;
    }

    if (newestFirst.length >= maxUserMessages || budget <= 0) continue;

    const clipped = clip(text, Math.min(maxMessageChars, budget));
    if (!clipped) continue;
    newestFirst.push(clipped);
    budget -= clipped.length;
  }

  return {
    userRequests: newestFirst.reverse(),
    ...(agentClaim ? { agentClaim } : {}),
  };
}
