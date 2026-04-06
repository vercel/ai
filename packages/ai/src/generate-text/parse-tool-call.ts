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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let parsedInput: any;

  if (tool.lazy) {
    // Lazy tools receive { jsonInput: string } from the LLM.
    // Unwrap the JSON string and validate against the real schema.
    const wrapperResult =
      toolCall.input.trim() === ''
        ? await safeValidateTypes({ value: {}, schema })
        : await safeParseJSON({ text: toolCall.input });

    if (wrapperResult.success === false) {
      throw new InvalidToolInputError({
        toolName,
        toolInput: toolCall.input,
        cause: wrapperResult.error,
      });
    }

    const wrapper = wrapperResult.value as Record<string, unknown>;
    const jsonInputStr =
      typeof wrapper?.jsonInput === 'string' ? wrapper.jsonInput : null;

    if (jsonInputStr == null) {
      throw new InvalidToolInputError({
        toolName,
        toolInput: toolCall.input,
        cause: new Error(
          'Lazy tool call missing jsonInput field. Call __load_tool_schema__ first to get the input structure.',
        ),
      });
    }

    const realParseResult = await safeParseJSON({
      text: jsonInputStr,
      schema,
    });

    if (realParseResult.success === false) {
      throw new InvalidToolInputError({
        toolName,
        toolInput: jsonInputStr,
        cause: realParseResult.error,
      });
    }

    parsedInput = realParseResult.value;
  } else {
    // Normal (non-lazy) tools: validate directly against schema
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

    parsedInput = parseResult.value;
  }

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
