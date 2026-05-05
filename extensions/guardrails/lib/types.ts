import type { AgentTool, ThinkingLevel } from "@mariozechner/pi-agent-core";
import type { Model } from "@mariozechner/pi-ai";
import type { Skill, ToolDefinition } from "@mariozechner/pi-coding-agent";

/**
 * Configuration for a subagent.
 */
export interface SubagentConfig {
  /** Subagent name (for logging and run ID) */
  name: string;

  /** Model instance to use */
  // biome-ignore lint/suspicious/noExplicitAny: Model type requires any for generic API
  model: Model<any>;

  /** System prompt for the subagent */
  systemPrompt: string;

  /** Built-in tools (AgentTool[]) - e.g., from createReadOnlyTools() */
  tools?: AgentTool[];

  /** Custom tools (ToolDefinition[]) - e.g., GitHub tools */
  customTools?: ToolDefinition[];

  /** Skills to load into system prompt */
  skills?: Skill[];

  /** Thinking level. Default: "low" */
  thinkingLevel?: ThinkingLevel;

  /** Logging options */
  logging?: {
    /** Enable logging. Default: false */
    enabled: boolean;
    /** Include raw events in debug.jsonl. Default: false */
    debug?: boolean;
  };
}

/**
 * Tool call state for tracking subagent tool executions.
 */
export interface SubagentToolCall {
  toolCallId: string;
  toolName: string;
  args: Record<string, unknown>;
  status: "running" | "done" | "error";
  /** Epoch ms when tool execution started */
  startedAt?: number;
  /** Epoch ms when tool execution ended */
  endedAt?: number;
  /** Duration in milliseconds (set when ended) */
  durationMs?: number;
  result?: unknown;
  error?: string;
  /** Partial result from tool updates (for progress display) */
  partialResult?: {
    content: Array<{ type: string; text?: string }>;
    details?: unknown;
  };
}

/**
 * Usage/cost information from the model response.
 */
export interface SubagentUsage {
  /** Input tokens from API (if available) */
  inputTokens?: number;
  /** Output tokens from API (if available) */
  outputTokens?: number;
  /** Cache read tokens (if available) */
  cacheReadTokens?: number;
  /** Cache write tokens (if available) */
  cacheWriteTokens?: number;
  /** Estimated tokens from response length (chars/4) */
  estimatedTokens: number;
  /** LLM cost in USD (if available) */
  llmCost?: number;
  /** Tool/API cost in USD (e.g., Exa, GitHub) */
  toolCost?: number;
  /** Total cost in USD (llmCost + toolCost) */
  totalCost?: number;
}

/**
 * Result from executing a subagent.
 */
export interface SubagentResult {
  /** Final text content from the subagent */
  content: string;

  /** Whether the subagent was aborted */
  aborted: boolean;

  /** Final tool call states */
  toolCalls: SubagentToolCall[];

  /** Total subagent execution duration in milliseconds */
  totalDurationMs: number;

  /** Error message if the subagent failed */
  error?: string;

  /** Unique run identifier */
  runId: string;

  /** Usage/cost information */
  usage: SubagentUsage;
}

/** Callback for text streaming updates */
export type OnTextUpdate = (delta: string, accumulated: string) => void;

/** Callback for tool execution updates */
export type OnToolUpdate = (toolCalls: SubagentToolCall[]) => void;
