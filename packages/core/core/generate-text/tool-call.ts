import { z } from 'zod';
import {
  InvalidToolArgumentsError,
  LanguageModelV1FunctionToolCall,
  NoSuchToolError,
  safeParseJSON,
} from '../../ai-model-specification';
import { ExperimentalTool } from '../tool';
import { ValueOf } from '../util/value-of';

export interface ToolCall<NAME extends string, ARGS> {
  toolCallId: string;
  toolName: NAME;
  args: ARGS;
}

// transforms the tools into a tool call union
export type ToToolCall<TOOLS extends Record<string, ExperimentalTool>> =
  ValueOf<{
    [NAME in keyof TOOLS]: {
      toolCallId: string;
      toolName: NAME & string;
      args: z.infer<TOOLS[NAME]['parameters']>;
    };
  }>;

export type ToToolCallArray<TOOLS extends Record<string, ExperimentalTool>> =
  Array<ToToolCall<TOOLS>>;

export function parseToolCall<TOOLS extends Record<string, ExperimentalTool>>({
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

  if (parseResult.success === false) {
    throw new InvalidToolArgumentsError({
      toolName,
      toolArgs: toolCall.args,
      cause: parseResult.error,
    });
  }

  return {
    toolCallId: toolCall.toolCallId,
    toolName,
    args: parseResult.value,
  };
}
