import { ValueOf } from 'type-fest';
import { z } from 'zod';
import {
  LanguageModelV1FunctionToolCall,
  NoSuchToolError,
  safeParseJSON,
} from '../../ai-model-specification';
import { Tool } from '../tool';

export interface ToolCall<NAME extends string, ARGS> {
  toolCallId: string;
  toolName: NAME;
  args: ARGS;
}

// transforms the tools into a tool call union
export type ToToolCall<TOOLS extends Record<string, Tool>> = ValueOf<{
  [NAME in keyof TOOLS]: {
    toolCallId: string;
    toolName: NAME & string;
    args: z.infer<TOOLS[NAME]['parameters']>;
  };
}>;

export type ToToolCallArray<TOOLS extends Record<string, Tool>> = Array<
  ToToolCall<TOOLS>
>;

export function parseToolCall<TOOLS extends Record<string, Tool>>({
  toolCall,
  tools,
}: {
  toolCall: LanguageModelV1FunctionToolCall;
  tools?: TOOLS;
}): ToToolCall<TOOLS> {
  const toolName = toolCall.toolName as keyof TOOLS & string;

  if (tools == null) {
    throw new NoSuchToolError({
      message: `Tool ${toolCall.toolName} not found (no tools provided).`,
      toolName: toolCall.toolName,
    });
  }

  const tool = tools[toolName];

  if (tool == null) {
    throw new NoSuchToolError({
      message: `Tool ${toolCall.toolName} not found.`,
      toolName: toolCall.toolName,
    });
  }

  const parseResult = safeParseJSON({
    text: toolCall.args,
    schema: tool.parameters,
  });

  // TODO dedicate tool call error (InvalidToolArgumentsError)
  if (parseResult.success === false) {
    throw new Error(
      `Tool call ${toolName} has invalid arguments: ${parseResult.error}`,
    );
  }

  // TODO should have typesafe tool call arguments
  const toolArgs = parseResult.value;

  return {
    toolCallId: toolCall.toolCallId,
    toolName,
    args: toolArgs,
  };
}
