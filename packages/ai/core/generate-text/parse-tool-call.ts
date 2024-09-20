import { LanguageModelV1FunctionToolCall } from '@ai-sdk/provider';
import { safeParseJSON, safeValidateTypes } from '@ai-sdk/provider-utils';
import { Schema, asSchema } from '@ai-sdk/ui-utils';
import { InvalidToolArgumentsError } from '../../errors/invalid-tool-arguments-error';
import { NoSuchToolError } from '../../errors/no-such-tool-error';
import { CoreTool } from '../tool';
import { inferParameters } from '../tool/tool';
import { ToToolCall } from './tool-call';

export function parseToolCall<TOOLS extends Record<string, CoreTool>>({
  toolCall,
  tools,
}: {
  toolCall: LanguageModelV1FunctionToolCall;
  tools?: TOOLS;
}): ToToolCall<TOOLS> {
  const toolName = toolCall.toolName as keyof TOOLS & string;

  if (tools == null) {
    throw new NoSuchToolError({ toolName: toolCall.toolName });
  }

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
