import { ValueOf } from 'type-fest';
import { z } from 'zod';
import zodToJsonSchema from 'zod-to-json-schema';
import { safeParseJSON } from '../../schema/parse-json';
import { ZodSchema } from '../../schema/zod-schema';
import { LanguageModel, LanguageModelToolCall } from '../language-model';
import { ChatPrompt } from '../prompt/chat-prompt';
import { convertToChatPrompt } from '../prompt/convert-to-chat-prompt';
import { InstructionPrompt } from '../prompt/instruction-prompt';
import { Tool } from '../tool/tool';

/**
 * Generate a text and call tools using a language model.
 */
export async function generateText<
  TOOLS extends {
    [name: string]: z.Schema;
  } = {},
>({
  model,
  tools,
  prompt,
}: {
  model: LanguageModel;
  tools?: {
    [name in keyof TOOLS]: Tool<TOOLS[name], unknown>;
  };
  prompt: InstructionPrompt | ChatPrompt;
}): Promise<GenerateTextResult<ValueOf<ToToolCalls<TOOLS>>>> {
  const modelResponse = await model.doGenerate({
    mode: {
      type: 'regular',
      tools:
        tools == null
          ? undefined
          : Object.entries(tools).map(([name, value]) => {
              const tool = value as Tool<any, unknown>;
              return {
                name,
                description: tool.description,
                parameters: zodToJsonSchema(tool.parameters),
              };
            }),
    },
    prompt: convertToChatPrompt(prompt),
  });

  // parse and validate tool calls
  const toolCalls: Array<ValueOf<ToToolCalls<TOOLS>>> = [];
  for (const modelToolCall of modelResponse.toolCalls ?? []) {
    toolCalls.push(parseToolCall({ toolCall: modelToolCall, tools }));
  }

  // should have typesafe tool call arguments
  // invalid tool error

  return new GenerateTextResult({
    // Always return a string so that the caller doesn't have to check for undefined.
    // If they need to check if the model did not return any text,
    // they can check the length of the string:
    text: modelResponse.text ?? '',
    toolCalls,
  });
}

function parseToolCall<
  TOOLS extends {
    [name: string]: z.Schema;
  } = {},
>({
  toolCall,
  tools,
}: {
  toolCall: LanguageModelToolCall;
  tools?: {
    [name in keyof TOOLS]: Tool<TOOLS[name], unknown>;
  };
}): ValueOf<ToToolCalls<TOOLS>> {
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

export interface ToolCall<TOOL_NAME extends string, ARGS> {
  toolCallId: string;
  toolName: TOOL_NAME;
  args: ARGS;
}

// transforms the tools into tool calls
type ToToolCalls<
  TOOLS extends {
    [name: string]: z.Schema;
  },
> = {
  [K in keyof TOOLS]: {
    toolCallId: string;
    toolName: K;
    args: z.infer<TOOLS[K]>;
  };
};

export class GenerateTextResult<T> {
  readonly text: string;
  readonly toolCalls: Array<T>;

  constructor(options: { text: string; toolCalls: Array<T> }) {
    this.text = options.text;
    this.toolCalls = options.toolCalls;
  }
}
