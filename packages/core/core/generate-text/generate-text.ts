import zodToJsonSchema from 'zod-to-json-schema';
import { LanguageModelV1 } from '../../ai-model-specification/index';
import { CallSettings } from '../prompt/call-settings';
import { convertToLanguageModelPrompt } from '../prompt/convert-to-language-model-prompt';
import { getInputFormat } from '../prompt/get-input-format';
import { Prompt } from '../prompt/prompt';
import { validateCallSettings } from '../prompt/validate-call-settings';
import { Tool } from '../tool/tool';
import { retryWithExponentialBackoff } from '../util/retry-with-exponential-backoff';
import { ToToolCallArray, parseToolCall } from './tool-call';
import { ToToolResultArray } from './tool-result';

/**
 * Generate a text and call tools using a language model.
 */
export async function generateText<TOOLS extends Record<string, Tool>>({
  model,
  tools,
  system,
  prompt,
  messages,
  maxRetries,
  ...settings
}: CallSettings &
  Prompt & {
    model: LanguageModelV1;
    tools?: TOOLS;
  }): Promise<GenerateTextResult<TOOLS>> {
  const retry = retryWithExponentialBackoff({ maxRetries });
  const modelResponse = await retry(() =>
    model.doGenerate({
      mode: {
        type: 'regular',
        tools:
          tools == null
            ? undefined
            : Object.entries(tools).map(([name, tool]) => ({
                type: 'function',
                name,
                description: tool.description,
                parameters: zodToJsonSchema(tool.parameters),
              })),
      },
      ...validateCallSettings(settings),
      inputFormat: getInputFormat({ prompt, messages }),
      prompt: convertToLanguageModelPrompt({
        system,
        prompt,
        messages,
      }),
    }),
  );

  // parse tool calls:
  const toolCalls: ToToolCallArray<TOOLS> = [];
  for (const modelToolCall of modelResponse.toolCalls ?? []) {
    toolCalls.push(parseToolCall({ toolCall: modelToolCall, tools }));
  }

  // execute tools:
  const toolResults =
    tools == null ? [] : await executeTools({ toolCalls, tools });

  return new GenerateTextResult({
    // Always return a string so that the caller doesn't have to check for undefined.
    // If they need to check if the model did not return any text,
    // they can check the length of the string:
    text: modelResponse.text ?? '',
    toolCalls,
    toolResults,
  });
}

async function executeTools<TOOLS extends Record<string, Tool>>({
  toolCalls,
  tools,
}: {
  toolCalls: ToToolCallArray<TOOLS>;
  tools: TOOLS;
}): Promise<ToToolResultArray<TOOLS>> {
  const toolResults = await Promise.all(
    toolCalls.map(async toolCall => {
      const tool = tools[toolCall.toolName];

      if (tool?.execute == null) {
        return undefined;
      }

      const result = await tool.execute(toolCall.args);

      return {
        toolCallId: toolCall.toolCallId,
        toolName: toolCall.toolName,
        args: toolCall.args,
        result,
      } as ToToolResultArray<TOOLS>[number];
    }),
  );

  return toolResults.filter(
    (result): result is NonNullable<typeof result> => result != null,
  );
}

export class GenerateTextResult<TOOLS extends Record<string, Tool>> {
  readonly text: string;
  readonly toolCalls: ToToolCallArray<TOOLS>;
  readonly toolResults: ToToolResultArray<TOOLS>;

  constructor(options: {
    text: string;
    toolCalls: ToToolCallArray<TOOLS>;
    toolResults: ToToolResultArray<TOOLS>;
  }) {
    this.text = options.text;
    this.toolCalls = options.toolCalls;
    this.toolResults = options.toolResults;
  }
}
