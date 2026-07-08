import type { HarnessV1StreamPart, HarnessV1ToolSpec } from "@ai-sdk/harness";

export interface AcpStreamMapperState {
  textId: string;
  textOpen: boolean;
  assistantText: string;
}

export function createAcpStreamMapperState(): AcpStreamMapperState {
  return {
    textId: "assistant-text",
    textOpen: false,
    assistantText: "",
  };
}

export function mapSessionUpdate(
  state: AcpStreamMapperState,
  params: unknown,
): HarnessV1StreamPart[] {
  const update = (params as { update?: Record<string, unknown> } | undefined)?.update;
  if (!update) return [];

  const sessionUpdate = update.sessionUpdate;
  if (sessionUpdate === "agent_message_chunk") {
    const content = update.content as { text?: string } | undefined;
    const delta = content?.text ?? "";
    if (!delta) return [];

    state.assistantText += delta;
    const parts: HarnessV1StreamPart[] = [];
    if (!state.textOpen) {
      state.textOpen = true;
      parts.push({ type: "text-start", id: state.textId });
    }
    parts.push({ type: "text-delta", id: state.textId, delta });
    return parts;
  }

  if (sessionUpdate === "tool_call") {
    const toolCall = update as {
      toolCallId?: string;
      toolName?: string;
      input?: unknown;
    };
    if (!toolCall.toolCallId || !toolCall.toolName) return [];
    return [
      {
        type: "tool-call",
        toolCallId: toolCall.toolCallId,
        toolName: toolCall.toolName,
        input:
          typeof toolCall.input === "string"
            ? toolCall.input
            : JSON.stringify(toolCall.input ?? {}),
      },
    ];
  }

  return [];
}

export function closeTextStream(state: AcpStreamMapperState): HarnessV1StreamPart[] {
  if (!state.textOpen) return [];
  state.textOpen = false;
  return [{ type: "text-end", id: state.textId }];
}

export function finishStream(): HarnessV1StreamPart[] {
  return [
    {
      type: "finish",
      finishReason: { unified: "stop", raw: undefined },
      totalUsage: {
        inputTokens: {
          total: undefined,
          noCache: undefined,
          cacheRead: undefined,
          cacheWrite: undefined,
        },
        outputTokens: { total: undefined, text: undefined, reasoning: undefined },
      },
    },
  ];
}

export function toolSpecsToMcpServers(tools: ReadonlyArray<HarnessV1ToolSpec>): unknown[] {
  if (tools.length === 0) return [];
  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema,
  }));
}

export function hostToolNames(tools: ReadonlyArray<HarnessV1ToolSpec>): Set<string> {
  return new Set(tools.map((tool) => tool.name));
}