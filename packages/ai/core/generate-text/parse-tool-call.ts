import { LanguageModelV1FunctionToolCall } from '@ai-sdk/provider';
import { safeParseJSON, safeValidateTypes } from '@ai-sdk/provider-utils';
import { Schema, asSchema } from '@ai-sdk/ui-utils';
import { InvalidToolArgumentsError } from '../../errors/invalid-tool-arguments-error';
import { NoSuchToolError } from '../../errors/no-such-tool-error';
import { CoreMessage } from '../prompt';
import { CoreTool } from '../tool';
import { inferParameters } from '../tool/tool';
import { ToolCallUnion } from './tool-call';
import { ToolCallRepairFunction } from './tool-call-repair';
import { ToolCallRepairError } from '../../errors/tool-call-repair-error';

export async function parseToolCall<TOOLS extends Record<string, CoreTool>>({
  toolCall,
  tools,
  repairToolCall,
  system,
  messages,
}: {
  toolCall: LanguageModelV1FunctionToolCall;
  tools: TOOLS | undefined;
  repairToolCall: ToolCallRepairFunction<TOOLS> | undefined;
  system: string | undefined;
  messages: CoreMessage[];
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
        InvalidToolArgumentsError.isInstance(error)
      )
    ) {
      throw error;
    }

    let repairedToolCall: LanguageModelV1FunctionToolCall | null = null;

    try {
      repairedToolCall = await repairToolCall({
        toolCall,
        tools,
        parameterSchema: ({ toolName }) =>
          asSchema(tools[toolName].parameters).jsonSchema,
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

async function doParseToolCall<TOOLS extends Record<string, CoreTool>>({
  toolCall,
  tools,
}: {
  toolCall: LanguageModelV1FunctionToolCall;
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

  const schema = asSchema(tool.parameters) as Schema<
    inferParameters<TOOLS[keyof TOOLS]['parameters']>
  >;

  // when the tool call has no arguments, we try passing an empty object to the schema
  // (many LLMs generate empty strings for tool calls with no arguments)
  const parseResult =
    toolCall.args.trim() === ''
      ? safeValidateTypes({ value: {}, schema })
      : safeParseJSON({ text: toolCall.args, schema });

  if (parseResult.success === false) {
    throw new InvalidToolArgumentsError({
      toolName,
      toolArgs: toolCall.args,
      cause: parseResult.error,
    });
  }

  return {
    type: 'tool-call',
    toolCallId: toolCall.toolCallId,
    toolName,
    args: parseResult.value,
  };
}
