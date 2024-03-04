import zodToJsonSchema from 'zod-to-json-schema';
import { LanguageModel } from '../language-model';
import { ChatPrompt } from '../prompt/chat-prompt';
import { convertToChatPrompt } from '../prompt/convert-to-chat-prompt';
import { InstructionPrompt } from '../prompt/instruction-prompt';
import { Tool } from '../tool/tool';
import { ToToolCallArray, parseToolCall } from './tool-call';

/**
 * Generate a text and call tools using a language model.
 */
export async function generateText<TOOLS extends Record<string, Tool>>({
  model,
  tools,
  prompt,
}: {
  model: LanguageModel;
  tools?: TOOLS;
  prompt: InstructionPrompt | ChatPrompt;
}): Promise<GenerateTextResult<TOOLS>> {
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

  // parse tool calls:
  const toolCalls: ToToolCallArray<TOOLS> = [];
  for (const modelToolCall of modelResponse.toolCalls ?? []) {
    toolCalls.push(parseToolCall({ toolCall: modelToolCall, tools }));
  }

  return new GenerateTextResult({
    // Always return a string so that the caller doesn't have to check for undefined.
    // If they need to check if the model did not return any text,
    // they can check the length of the string:
    text: modelResponse.text ?? '',
    toolCalls,
  });
}

export class GenerateTextResult<TOOLS extends Record<string, Tool>> {
  readonly text: string;
  readonly toolCalls: ToToolCallArray<TOOLS>;

  constructor(options: { text: string; toolCalls: ToToolCallArray<TOOLS> }) {
    this.text = options.text;
    this.toolCalls = options.toolCalls;
  }
}
