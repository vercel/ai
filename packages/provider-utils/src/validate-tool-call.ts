import type { LanguageModelV4ToolCall } from '@ai-sdk/provider';
import { InvalidToolInputError } from './invalid-tool-input-error';
import { NoSuchToolError } from './no-such-tool-error';
import { safeParseJSON } from './parse-json';
import { asSchema } from './schema';
import type { ToolSet } from './types/tool-set';
import type { DynamicToolCall, TypedToolCall } from './types/typed-tool-call';
import { safeValidateTypes } from './validate-types';

/**
 * Validates a tool call from a language model against a declared tool set.
 *
 * Looks up the tool by name, parses the input string as JSON, and validates
 * the parsed value against the tool's input schema. Returns a typed
 * `TypedToolCall` on success, throws `NoSuchToolError` or
 * `InvalidToolInputError` on failure.
 *
 * Provider-executed dynamic tools that are not part of the declared tool set
 * are parsed without schema validation.
 */
export async function validateToolCall<TOOLS extends ToolSet>({
  toolCall,
  tools,
}: {
  toolCall: LanguageModelV4ToolCall;
  tools: TOOLS | undefined;
}): Promise<TypedToolCall<TOOLS>> {
  if (tools == null) {
    if (toolCall.providerExecuted && toolCall.dynamic) {
      return validateProviderExecutedDynamicToolCall(toolCall);
    }

    throw new NoSuchToolError({ toolName: toolCall.toolName });
  }

  const toolName = toolCall.toolName as keyof TOOLS & string;
  const tool = tools[toolName];

  if (tool == null) {
    if (toolCall.providerExecuted && toolCall.dynamic) {
      return validateProviderExecutedDynamicToolCall(toolCall);
    }

    throw new NoSuchToolError({
      toolName: toolCall.toolName,
      availableTools: Object.keys(tools),
    });
  }

  const schema = asSchema(tool.inputSchema);

  // when the tool call has no arguments, we try passing an empty object to the schema
  // (many LLMs generate empty strings for tool calls with no arguments)
  const parseResult =
    toolCall.input.trim() === ''
      ? await safeValidateTypes({ value: {}, schema })
      : await safeParseJSON({ text: toolCall.input, schema });

  if (parseResult.success === false) {
    throw new InvalidToolInputError({
      toolName,
      toolInput: toolCall.input,
      cause: parseResult.error,
    });
  }

  return tool.type === 'dynamic'
    ? {
        type: 'tool-call',
        toolCallId: toolCall.toolCallId,
        toolName: toolCall.toolName,
        input: parseResult.value,
        providerExecuted: toolCall.providerExecuted,
        providerMetadata: toolCall.providerMetadata,
        ...(tool.metadata != null ? { toolMetadata: tool.metadata } : {}),
        dynamic: true,
        title: tool.title,
      }
    : {
        type: 'tool-call',
        toolCallId: toolCall.toolCallId,
        toolName,
        input: parseResult.value,
        providerExecuted: toolCall.providerExecuted,
        providerMetadata: toolCall.providerMetadata,
        ...(tool.metadata != null ? { toolMetadata: tool.metadata } : {}),
        title: tool.title,
      };
}

async function validateProviderExecutedDynamicToolCall(
  toolCall: LanguageModelV4ToolCall,
): Promise<DynamicToolCall> {
  const parseResult =
    toolCall.input.trim() === ''
      ? { success: true as const, value: {} }
      : await safeParseJSON({ text: toolCall.input });

  if (parseResult.success === false) {
    throw new InvalidToolInputError({
      toolName: toolCall.toolName,
      toolInput: toolCall.input,
      cause: parseResult.error,
    });
  }

  return {
    type: 'tool-call',
    toolCallId: toolCall.toolCallId,
    toolName: toolCall.toolName,
    input: parseResult.value,
    providerExecuted: true,
    dynamic: true,
    providerMetadata: toolCall.providerMetadata,
  };
}
