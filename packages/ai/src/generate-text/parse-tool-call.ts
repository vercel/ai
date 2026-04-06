import { LanguageModelV4ToolCall } from '@ai-sdk/provider';
import {
  asSchema,
  ModelMessage,
  safeParseJSON,
  safeValidateTypes,
  SystemModelMessage,
} from '@ai-sdk/provider-utils';
import { InvalidToolInputError } from '../error/invalid-tool-input-error';
import { NoSuchToolError } from '../error/no-such-tool-error';
import { ToolCallRepairError } from '../error/tool-call-repair-error';
import { DynamicToolCall, TypedToolCall } from './tool-call';
import { ToolCallRepairFunction } from './tool-call-repair-function';
import type { ToolSet } from '@ai-sdk/provider-utils';

export async function parseToolCall<TOOLS extends ToolSet>({
  toolCall,
  tools,
  repairToolCall,
  system,
  messages,
}: {
  toolCall: LanguageModelV4ToolCall;
  tools: TOOLS | undefined;
  repairToolCall: ToolCallRepairFunction<TOOLS> | undefined;
  system: string | SystemModelMessage | Array<SystemModelMessage> | undefined;
  messages: ModelMessage[];
}): Promise<TypedToolCall<TOOLS>> {
  try {
    if (tools == null) {
      // provider-executed dynamic tools are not part of our list of tools:
      if (toolCall.providerExecuted && toolCall.dynamic) {
        return await parseProviderExecutedDynamicToolCall(toolCall);
      }

      throw new NoSuchToolError({ toolName: toolCall.toolName });
    }

    try {
      return await doParseToolCall({ toolCall, tools });
    } catch (error) {
      if (
        repairToolCall == null ||
        !(
          NoSuchToolError.isInstance(error) ||
          InvalidToolInputError.isInstance(error)
        )
      ) {
        throw error;
      }

      let repairedToolCall: LanguageModelV4ToolCall | null = null;

      try {
        repairedToolCall = await repairToolCall({
          toolCall,
          tools,
          inputSchema: async ({ toolName }) => {
            const { inputSchema } = tools[toolName];
            return await asSchema(inputSchema).jsonSchema;
          },
          system,
          messages,
          error,
        });
      } catch (repairError) {
        throw new ToolCallRepairError({
          cause: repairError,
          originalError: error,
        });
      }

      // no repaired tool call returned
      if (repairedToolCall == null) {
        throw error;
      }

      return await doParseToolCall({ toolCall: repairedToolCall, tools });
    }
  } catch (error) {
    // use parsed input when possible
    const parsedInput = await safeParseJSON({ text: toolCall.input });
    const input = parsedInput.success ? parsedInput.value : toolCall.input;

    // TODO AI SDK 6: special invalid tool call parts
    return {
      type: 'tool-call',
      toolCallId: toolCall.toolCallId,
      toolName: toolCall.toolName,
      input,
      dynamic: true,
      invalid: true,
      error,
      title: tools?.[toolCall.toolName]?.title,
      providerExecuted: toolCall.providerExecuted,
      providerMetadata: toolCall.providerMetadata,
    };
  }
}

async function parseProviderExecutedDynamicToolCall(
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

async function doParseToolCall<TOOLS extends ToolSet>({
  toolCall,
  tools,
}: {
  toolCall: LanguageModelV4ToolCall;
  tools: TOOLS;
}): Promise<TypedToolCall<TOOLS>> {
  const toolName = toolCall.toolName as keyof TOOLS & string;

  const tool = tools[toolName];

  if (tool == null) {
    // provider-executed dynamic tools are not part of our list of tools:
    if (toolCall.providerExecuted && toolCall.dynamic) {
      return await parseProviderExecutedDynamicToolCall(toolCall);
    }

    throw new NoSuchToolError({
      toolName: toolCall.toolName,
      availableTools: Object.keys(tools),
    });
  }

  const schema = asSchema(tool.inputSchema);

  // when the tool call has no arguments, we try passing an empty object to the schema
  // (many LLMs generate empty strings for tool calls with no arguments)
  let parseResult =
    toolCall.input.trim() === ''
      ? await safeValidateTypes({ value: {}, schema })
      : await safeParseJSON({ text: toolCall.input, schema });

  // For lazy tools, the LLM may send strings for nested objects/arrays
  // because it only sees a minimal schema. Try to repair by JSON.parsing
  // string values that should be objects/arrays according to the real schema.
  if (parseResult.success === false && tool.lazy) {
    const rawParseResult = await safeParseJSON({ text: toolCall.input });
    if (rawParseResult.success) {
      const repaired = repairLazyToolInput(
        rawParseResult.value as Record<string, unknown>,
        (await schema.jsonSchema) as Record<string, unknown>,
      );
      parseResult = await safeValidateTypes({ value: repaired, schema });
    }
  }

  if (parseResult.success === false) {
    throw new InvalidToolInputError({
      toolName,
      toolInput: toolCall.input,
      cause: parseResult.error,
    });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const parsedInput: any = parseResult.value;

  return tool.type === 'dynamic'
    ? {
        type: 'tool-call',
        toolCallId: toolCall.toolCallId,
        toolName: toolCall.toolName,
        input: parsedInput,
        providerExecuted: toolCall.providerExecuted,
        providerMetadata: toolCall.providerMetadata,
        dynamic: true,
        title: tool.title,
      }
    : {
        type: 'tool-call',
        toolCallId: toolCall.toolCallId,
        toolName,
        input: parsedInput,
        providerExecuted: toolCall.providerExecuted,
        providerMetadata: toolCall.providerMetadata,
        title: tool.title,
      };
}

/**
 * Repairs lazy tool input by JSON.parsing string values that should be
 * objects or arrays according to the JSON Schema. LLMs send strings for
 * nested fields when the tool definition has a minimal schema.
 */
function repairLazyToolInput(
  input: Record<string, unknown>,
  jsonSchema: Record<string, unknown>,
): Record<string, unknown> {
  const properties = jsonSchema.properties as
    | Record<string, Record<string, unknown>>
    | undefined;

  if (properties == null) {
    return input;
  }

  const repaired = { ...input };

  for (const [key, value] of Object.entries(repaired)) {
    if (typeof value !== 'string') {
      continue;
    }

    const propSchema = properties[key];
    if (propSchema == null) {
      continue;
    }

    const expectedType = propSchema.type as string | undefined;
    if (expectedType === 'object' || expectedType === 'array') {
      try {
        repaired[key] = JSON.parse(value);
      } catch {
        // keep original string if not valid JSON
      }
    }
  }

  return repaired;
}
