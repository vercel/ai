import zodToJsonSchema from 'zod-to-json-schema';
import { LanguageModel } from '../language-model';
import { ChatPrompt } from '../prompt/chat-prompt';
import { convertToChatPrompt } from '../prompt/convert-to-chat-prompt';
import { InstructionPrompt } from '../prompt/instruction-prompt';
import { Tool } from '../tool/tool';
import { ToolDefinition } from '../tool/tool-definition';
import { ZodSchema } from '../../schema/zod-schema';
import { safeParseJSON } from '../../schema/parse-json';

/**
 * Generate a text and call tools using a language model.
 */
export async function generateText({
  model,
  tools,
  prompt,
}: {
  model: LanguageModel;
  tools?: Array<
    ToolDefinition<string, unknown> | Tool<string, unknown, unknown>
  >;
  prompt: InstructionPrompt | ChatPrompt;
}): Promise<GenerateTextResult> {
  const modelResponse = await model.doGenerate({
    mode: {
      type: 'regular',
      tools: tools?.map(tool => ({
        name: tool.name,
        description: tool.description,
        parameters: zodToJsonSchema(tool.parameters),
      })),
    },
    prompt: convertToChatPrompt(prompt),
  });

  // parse and validate tool calls
  const toolCalls: Array<ToolCall> = [];
  for (const modelToolCall of modelResponse.toolCalls ?? []) {
    // TODO extract into reusable function for parsing tool call arguments (typed)
    const tool = tools?.find(tool => tool.name === modelToolCall.toolName);

    // TODO add dedicated error to list of errors (NoSuchToolError)
    if (tool == null) {
      throw new Error(`Tool not found: ${modelToolCall.toolName}`);
    }

    const parseResult = safeParseJSON({
      text: modelToolCall.args,
      schema: new ZodSchema(tool.parameters),
    });

    // TODO dedicate tool call error (InvalidToolArgumentsError)
    if (parseResult.success === false) {
      throw new Error(
        `Tool call ${modelToolCall.toolName} has invalid arguments: ${parseResult.error}`,
      );
    }

    // TODO should have typesafe tool call arguments
    const toolArgs = parseResult.value;

    toolCalls.push({
      toolCallId: modelToolCall.toolCallId,
      toolName: modelToolCall.toolName,
      args: toolArgs,
    });
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

// TODO typed
export interface ToolCall {
  toolCallId: string;
  toolName: string;

  args: unknown;
}

export class GenerateTextResult {
  readonly text: string;
  readonly toolCalls: Array<ToolCall>;

  constructor(options: { text: string; toolCalls: Array<ToolCall> }) {
    this.text = options.text;
    this.toolCalls = options.toolCalls;
  }
}
