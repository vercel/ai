import {
  isJSONObject,
  type LanguageModelV4FunctionTool,
  type LanguageModelV4ToolCall,
  type SharedV4ProviderOptions,
} from '@ai-sdk/provider';
import { safeParseJSON } from '@ai-sdk/provider-utils';

const parallelToolName = 'parallel';
const recipientNamePrefix = 'functions.';

/**
 * Preserves the original wrapper identity so child results can be sent back as
 * one function output when Responses API server-side state is used.
 */
export type ParallelToolCallMetadata = {
  itemId: string;
  toolCallId: string;
  toolName: string;
  input: string;
  index: number;
  count: number;
};

export function getParallelToolCallMetadata({
  providerOptions,
  providerOptionsName,
}: {
  providerOptions: SharedV4ProviderOptions | undefined;
  providerOptionsName: string;
}): ParallelToolCallMetadata | undefined {
  const metadata = providerOptions?.[providerOptionsName]?.parallelToolCall;

  if (
    !isJSONObject(metadata) ||
    typeof metadata.itemId !== 'string' ||
    typeof metadata.toolCallId !== 'string' ||
    typeof metadata.toolName !== 'string' ||
    typeof metadata.input !== 'string' ||
    typeof metadata.index !== 'number' ||
    !Number.isInteger(metadata.index) ||
    typeof metadata.count !== 'number' ||
    !Number.isInteger(metadata.count) ||
    metadata.index < 0 ||
    metadata.count <= metadata.index
  ) {
    return undefined;
  }

  return metadata as ParallelToolCallMetadata;
}

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
  providerOptionsName,
  itemId,
}: {
  toolCall: Pick<LanguageModelV4ToolCall, 'toolCallId' | 'toolName' | 'input'>;
  tools: Array<LanguageModelV4FunctionTool>;
  providerOptionsName: string;
  itemId: string;
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
      providerMetadata: {
        [providerOptionsName]: {
          parallelToolCall: {
            itemId,
            toolCallId: toolCall.toolCallId,
            toolName: toolCall.toolName,
            input: toolCall.input,
            index,
            count: toolUses.length,
          } satisfies ParallelToolCallMetadata,
        },
      },
    });
  }

  return expandedToolCalls;
}
