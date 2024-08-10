import { LanguageModelV1FunctionToolCall } from '@ai-sdk/provider';
import { safeParseJSON } from '@ai-sdk/provider-utils';
import { InvalidToolArgumentsError } from '../../errors/invalid-tool-arguments-error';
import { NoSuchToolError } from '../../errors/no-such-tool-error';
import { CoreTool } from '../tool';
import { inferParameters } from '../tool/tool';
import { Schema, asSchema } from '../util/schema';
import { ValueOf } from '../util/value-of';

/**
Typed tool call that is returned by generateText and streamText.
It contains the tool call ID, the tool name, and the tool arguments.
 */
export interface ToolCall<NAME extends string, ARGS> {
  /**
ID of the tool call. This ID is used to match the tool call with the tool result.
 */
  toolCallId: string;

  /**
Name of the tool that is being called.
 */
  toolName: NAME;

  /**
Arguments of the tool call. This is a JSON-serializable object that matches the tool's input schema.
   */
  args: ARGS;
}

// transforms the tools into a tool call union
export type ToToolCall<TOOLS extends Record<string, CoreTool>> = ValueOf<{
  [NAME in keyof TOOLS]: {
    type: 'tool-call';
    toolCallId: string;
    toolName: NAME & string;
    args: inferParameters<TOOLS[NAME]['parameters']>;
  };
}>;

export type ToToolCallArray<TOOLS extends Record<string, CoreTool>> = Array<
  ToToolCall<TOOLS>
>;

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

  const parseResult = safeParseJSON({
    text: toolCall.args,
    schema: asSchema(tool.parameters) as Schema<
      inferParameters<TOOLS[keyof TOOLS]['parameters']>
    >,
  });

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
