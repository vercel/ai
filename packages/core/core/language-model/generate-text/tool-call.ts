import { ValueOf } from 'type-fest';
import { z } from 'zod';
import { safeParseJSON } from '../../schema/parse-json';
import { ZodSchema } from '../../schema/zod-schema';
import { LanguageModelToolCall } from '../language-model';
import { Tool } from '../tool';

export interface ToolCall<TOOL_NAME extends string, ARGS> {
  toolCallId: string;
  toolName: TOOL_NAME;
  args: ARGS;
}

// transforms the tools into tool calls
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
  toolCall: LanguageModelToolCall;
  tools?: TOOLS;
}): ToToolCall<TOOLS> {
  const toolName = toolCall.toolName as keyof TOOLS & string;

  if (tools == null) {
    // TODO add dedicated error to list of errors (NoSuchToolError)
    throw new Error(`Tool not found: ${toolName}`);
  }

  const tool = tools[toolName];

  // TODO add dedicated error to list of errors (NoSuchToolError)
  if (tool == null) {
    throw new Error(`Tool not found: ${toolName}`);
  }

  const parseResult = safeParseJSON({
    text: toolCall.args,
    schema: new ZodSchema(tool.parameters),
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
