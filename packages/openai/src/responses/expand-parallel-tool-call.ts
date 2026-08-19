import {
  isJSONObject,
  type LanguageModelV4FunctionTool,
  type LanguageModelV4ToolCall,
} from '@ai-sdk/provider';
import { safeParseJSON } from '@ai-sdk/provider-utils';

const parallelToolName = 'parallel';
const recipientNamePrefix = 'functions.';

export function isUndeclaredParallelToolCall({
  toolName,
  tools,
}: {
  toolName: string;
  tools: Array<LanguageModelV4FunctionTool>;
}): boolean {
  return (
    toolName === parallelToolName &&
    !tools.some(tool => tool.name === parallelToolName)
  );
}

/**
 * Expands the internal parallel tool wrapper that OpenAI models can emit as a
 * regular function call. The wrapper is only recognized when every nested
 * recipient is a declared client-side function tool.
 */
export async function expandParallelToolCall({
  toolCall,
  tools,
}: {
  toolCall: Pick<LanguageModelV4ToolCall, 'toolCallId' | 'toolName' | 'input'>;
  tools: Array<LanguageModelV4FunctionTool>;
}): Promise<Array<LanguageModelV4ToolCall> | undefined> {
  if (!isUndeclaredParallelToolCall({ toolName: toolCall.toolName, tools })) {
    return undefined;
  }

  const parsedInput = await safeParseJSON({ text: toolCall.input });

  if (!parsedInput.success || !isJSONObject(parsedInput.value)) {
    return undefined;
  }

  const toolUses = parsedInput.value.tool_uses;
  if (!Array.isArray(toolUses) || toolUses.length === 0) {
    return undefined;
  }

  const availableToolNames = new Set(tools.map(tool => tool.name));
  const expandedToolCalls: Array<LanguageModelV4ToolCall> = [];

  for (const [index, toolUse] of toolUses.entries()) {
    if (!isJSONObject(toolUse)) {
      return undefined;
    }

    const recipientName = toolUse.recipient_name;
    const parameters = toolUse.parameters;

    if (
      typeof recipientName !== 'string' ||
      !recipientName.startsWith(recipientNamePrefix) ||
      !isJSONObject(parameters)
    ) {
      return undefined;
    }

    const toolName = recipientName.slice(recipientNamePrefix.length);
    if (toolName.length === 0 || !availableToolNames.has(toolName)) {
      return undefined;
    }

    expandedToolCalls.push({
      type: 'tool-call',
      toolCallId: `${toolCall.toolCallId}_${index}`,
      toolName,
      input: JSON.stringify(parameters),
    });
  }

  return expandedToolCalls;
}
