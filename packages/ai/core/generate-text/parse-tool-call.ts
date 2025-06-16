import { LanguageModelV2ToolCall } from '@ai-sdk/provider';
import {
  asSchema,
  safeParseJSON,
  safeValidateTypes,
} from '@ai-sdk/provider-utils';
import { InvalidToolInputError } from '../../src/error/invalid-tool-input-error';
import { NoSuchToolError } from '../../src/error/no-such-tool-error';
import { ToolCallRepairError } from '../../src/error/tool-call-repair-error';
import { ModelMessage } from '../prompt';
import { ToolCallUnion } from './tool-call';
import { ToolCallRepairFunction } from './tool-call-repair-function';
import { ToolSet } from './tool-set';

export async function parseToolCall<TOOLS extends ToolSet>({
  toolCall,
  tools,
  repairToolCall,
  system,
  messages,
}: {
  toolCall: LanguageModelV2ToolCall;
  tools: TOOLS | undefined;
  repairToolCall: ToolCallRepairFunction<TOOLS> | undefined;
  system: string | undefined;
  messages: ModelMessage[];
}): Promise<ToolCallUnion<TOOLS>> {
  if (tools == null) {
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

    let repairedToolCall: LanguageModelV2ToolCall | null = null;

    try {
      repairedToolCall = await repairToolCall({
        toolCall,
        tools,
        inputSchema: ({ toolName }) => {
          const { inputSchema } = tools[toolName];
          return asSchema(inputSchema).jsonSchema;
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
}

async function doParseToolCall<TOOLS extends ToolSet>({
  toolCall,
  tools,
}: {
  toolCall: LanguageModelV2ToolCall;
  tools: TOOLS;
}): Promise<ToolCallUnion<TOOLS>> {
  const toolName = toolCall.toolName as keyof TOOLS & string;

  const tool = tools[toolName];

  if (tool == null) {
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

  return {
    type: 'tool-call',
    toolCallId: toolCall.toolCallId,
    toolName,
    input: parseResult.value,
  };
}
