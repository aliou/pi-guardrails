/**
 * Core subagent executor.
 *
 * Uses createAgentSession from the SDK for all subagent patterns.
 * Supports streaming text updates, tool execution tracking, and usage tracking.
 */

import type { AssistantMessage } from "@mariozechner/pi-ai";
import type { ExtensionContext } from "@mariozechner/pi-coding-agent";
import {
  createAgentSession,
  DefaultResourceLoader,
  getAgentDir,
  SessionManager,
  SettingsManager,
} from "@mariozechner/pi-coding-agent";
import {
  createExecutionTimer,
  markExecutionEnd,
  markExecutionStart,
} from "./timing";
import type {
  OnTextUpdate,
  OnToolUpdate,
  SubagentConfig,
  SubagentResult,
  SubagentToolCall,
  SubagentUsage,
} from "./types";

function generateRunId(name: string): string {
  const slug =
    name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-") || "subagent";
  const randomPart =
    typeof globalThis.crypto?.randomUUID === "function"
      ? globalThis.crypto.randomUUID().slice(0, 8)
      : Date.now().toString(36);
  return `${slug}-${randomPart}`;
}

/**
 * Execute a subagent with the given configuration.
 *
 * @param config - Subagent configuration
 * @param userMessage - The user's prompt
 * @param ctx - Extension context
 * @param onTextUpdate - Callback for streaming text
 * @param signal - Abort signal
 * @param onToolUpdate - Callback for tool execution updates
 */
export async function executeSubagent(
  config: SubagentConfig,
  userMessage: string,
  ctx: ExtensionContext,
  onTextUpdate?: OnTextUpdate,
  signal?: AbortSignal,
  onToolUpdate?: OnToolUpdate,
): Promise<SubagentResult> {
  const runId = generateRunId(config.name);
  const executionTimer = createExecutionTimer();

  const agentDir = getAgentDir();
  const settingsManager = SettingsManager.create(ctx.cwd, agentDir);
  const resourceLoader = new DefaultResourceLoader({
    cwd: ctx.cwd,
    agentDir,
    settingsManager,
    noExtensions: true,
    noPromptTemplates: true,
    noThemes: true,
    noSkills: true,
    systemPromptOverride: () => config.systemPrompt,
    appendSystemPromptOverride: () => [],
    agentsFilesOverride: () => ({ agentsFiles: [] }),
    skillsOverride: () => ({
      skills: config.skills ?? [],
      diagnostics: [],
    }),
  });
  await resourceLoader.reload();

  const { session } = await createAgentSession({
    model: config.model,
    tools: config.tools ?? [],
    customTools: config.customTools ?? [],
    sessionManager: SessionManager.inMemory(),
    thinkingLevel: config.thinkingLevel ?? "low",
    modelRegistry: ctx.modelRegistry,
    resourceLoader,
  });

  let accumulated = "";
  let finalResponse = "";
  let aborted = false;
  const toolCalls = new Map<string, SubagentToolCall>();

  let toolsHaveStarted = false;
  let toolsHaveCompleted = false;

  const usage: SubagentUsage = {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    estimatedTokens: 0,
    llmCost: 0,
    toolCost: 0,
    totalCost: 0,
  };

  const unsubscribe = session.subscribe((event) => {
    if (event.type === "message_update") {
      if (event.assistantMessageEvent.type === "text_delta") {
        const delta = event.assistantMessageEvent.delta;
        accumulated += delta;

        if (toolsHaveCompleted) {
          finalResponse += delta;
        }

        onTextUpdate?.(delta, accumulated);
      }
    }

    if (event.type === "tool_execution_start") {
      toolsHaveStarted = true;
      toolsHaveCompleted = false;
      finalResponse = "";
      const toolCall: SubagentToolCall = {
        toolCallId: event.toolCallId,
        toolName: event.toolName,
        args: event.args ?? {},
        status: "running",
      };
      markExecutionStart(toolCall);
      toolCalls.set(event.toolCallId, toolCall);
      onToolUpdate?.([...toolCalls.values()]);
    }

    if (event.type === "tool_execution_update") {
      const existing = toolCalls.get(event.toolCallId);
      if (existing) {
        existing.args = event.args ?? existing.args;
        if (event.partialResult) {
          existing.partialResult = event.partialResult as {
            content: Array<{ type: string; text?: string }>;
            details?: unknown;
          };
        }
        onToolUpdate?.([...toolCalls.values()]);
      }
    }

    if (event.type === "tool_execution_end") {
      const existing = toolCalls.get(event.toolCallId);
      if (existing) {
        existing.status = event.isError ? "error" : "done";
        existing.result = event.result;
        markExecutionEnd(existing);
        if (event.isError && event.result) {
          existing.error =
            typeof event.result === "string"
              ? event.result
              : JSON.stringify(event.result);
        }
        onToolUpdate?.([...toolCalls.values()]);

        const resultDetails = event.result?.details as
          | { cost?: number }
          | undefined;
        if (resultDetails?.cost !== undefined) {
          usage.toolCost = (usage.toolCost ?? 0) + resultDetails.cost;
        }
      }

      const allDone = [...toolCalls.values()].every(
        (tc) => tc.status === "done" || tc.status === "error",
      );
      if (allDone) {
        toolsHaveCompleted = true;
      }
    }

    if (event.type === "turn_end") {
      const msg = event.message;
      if (msg.role === "assistant") {
        const assistantMsg = msg as AssistantMessage;
        const msgUsage = assistantMsg.usage;
        if (msgUsage) {
          usage.inputTokens = (usage.inputTokens ?? 0) + msgUsage.input;
          usage.outputTokens = (usage.outputTokens ?? 0) + msgUsage.output;
          usage.cacheReadTokens =
            (usage.cacheReadTokens ?? 0) + msgUsage.cacheRead;
          usage.cacheWriteTokens =
            (usage.cacheWriteTokens ?? 0) + msgUsage.cacheWrite;
          usage.llmCost = (usage.llmCost ?? 0) + msgUsage.cost.total;
        }
      }
    }
  });

  if (signal) {
    if (signal.aborted) {
      unsubscribe();
      session.dispose();
      return {
        content: "",
        aborted: true,
        toolCalls: [],
        totalDurationMs: executionTimer.getDurationMs(),
        runId,
        usage,
      };
    }

    signal.addEventListener(
      "abort",
      () => {
        session.abort();
        aborted = true;
      },
      { once: true },
    );
  }

  let error: string | undefined;

  try {
    await session.prompt(userMessage);
  } catch (err) {
    if (signal?.aborted) {
      aborted = true;
    } else {
      error =
        err instanceof Error
          ? err.message
          : typeof err === "string"
            ? err
            : JSON.stringify(err);
    }
  } finally {
    unsubscribe();
    session.dispose();
  }

  const responseText = toolsHaveStarted ? finalResponse : accumulated;
  const cleanedContent = filterThinkingTags(responseText);

  const totalRealTokens =
    (usage.inputTokens ?? 0) +
    (usage.outputTokens ?? 0) +
    (usage.cacheReadTokens ?? 0) +
    (usage.cacheWriteTokens ?? 0);
  usage.estimatedTokens =
    totalRealTokens > 0
      ? totalRealTokens
      : Math.round(cleanedContent.length / 4);

  usage.totalCost = (usage.llmCost ?? 0) + (usage.toolCost ?? 0);

  return {
    content: cleanedContent,
    aborted,
    toolCalls: [...toolCalls.values()],
    totalDurationMs: executionTimer.getDurationMs(),
    error,
    runId,
    usage,
  };
}

/**
 * Filter out <thinking>...</thinking> tags from text.
 */
export function filterThinkingTags(text: string): string {
  return text.replace(/<thinking>[\s\S]*?<\/thinking>\s*/g, "");
}
