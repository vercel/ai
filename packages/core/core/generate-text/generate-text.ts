import {
  LanguageModelV1,
  LanguageModelV1CallWarning,
  LanguageModelV1FinishReason,
} from '../../spec';
import { CallSettings } from '../prompt/call-settings';
import { convertToLanguageModelPrompt } from '../prompt/convert-to-language-model-prompt';
import { getValidatedPrompt } from '../prompt/get-validated-prompt';
import { prepareCallSettings } from '../prompt/prepare-call-settings';
import { Prompt } from '../prompt/prompt';
import { ExperimentalTool } from '../tool/tool';
import { convertZodToJSONSchema } from '../util/convert-zod-to-json-schema';
import { retryWithExponentialBackoff } from '../util/retry-with-exponential-backoff';
import { TokenUsage, calculateTokenUsage } from './token-usage';
import { ToToolCallArray, parseToolCall } from './tool-call';
import { ToToolResultArray } from './tool-result';

/**
Generate a text and call tools for a given prompt using a language model.

This function does not stream the output. If you want to stream the output, use `experimental_streamText` instead.

@param model - The language model to use.
@param tools - The tools that the model can call. The model needs to support calling tools.

@param system - A system message that will be part of the prompt.
@param prompt - A simple text prompt. You can either use `prompt` or `messages` but not both.
@param messages - A list of messages. You can either use `prompt` or `messages` but not both.

@param maxTokens - Maximum number of tokens to generate.
@param temperature - Temperature setting. 
This is a number between 0 (almost no randomness) and 1 (very random).
It is recommended to set either `temperature` or `topP`, but not both.
@param topP - Nucleus sampling. This is a number between 0 and 1.
E.g. 0.1 would mean that only tokens with the top 10% probability mass are considered.
It is recommended to set either `temperature` or `topP`, but not both.
@param presencePenalty - Presence penalty setting. 
It affects the likelihood of the model to repeat information that is already in the prompt.
The presence penalty is a number between -1 (increase repetition) and 1 (maximum penalty, decrease repetition). 
0 means no penalty.
@param frequencyPenalty - Frequency penalty setting.
It affects the likelihood of the model to repeatedly use the same words or phrases.
The frequency penalty is a number between -1 (increase repetition) and 1 (maximum penalty, decrease repetition).
0 means no penalty.
@param seed - The seed (integer) to use for random sampling.
If set and supported by the model, calls will generate deterministic results.

@param maxRetries - Maximum number of retries. Set to 0 to disable retries. Default: 2.
@param abortSignal - An optional abort signal that can be used to cancel the call.

@returns
A result object that contains the generated text, the results of the tool calls, and additional information.
 */
export async function experimental_generateText<
  TOOLS extends Record<string, ExperimentalTool>,
>({
  model,
  tools,
  system,
  prompt,
  messages,
  maxRetries,
  abortSignal,
  ...settings
}: CallSettings &
  Prompt & {
    /**
The language model to use.
     */
    model: LanguageModelV1;

    /**
The tools that the model can call. The model needs to support calling tools.
*/
    tools?: TOOLS;
  }): Promise<GenerateTextResult<TOOLS>> {
  const retry = retryWithExponentialBackoff({ maxRetries });
  const validatedPrompt = getValidatedPrompt({ system, prompt, messages });
  const modelResponse = await retry(() => {
    return model.doGenerate({
      mode: {
        type: 'regular',
        tools:
          tools == null
            ? undefined
            : Object.entries(tools).map(([name, tool]) => ({
                type: 'function',
                name,
                description: tool.description,
                parameters: convertZodToJSONSchema(tool.parameters),
              })),
      },
      ...prepareCallSettings(settings),
      inputFormat: validatedPrompt.type,
      prompt: convertToLanguageModelPrompt(validatedPrompt),
      abortSignal,
    });
  });

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
    finishReason: modelResponse.finishReason,
    usage: calculateTokenUsage(modelResponse.usage),
    warnings: modelResponse.warnings,
  });
}

async function executeTools<TOOLS extends Record<string, ExperimentalTool>>({
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

/**
The result of a `generateText` call.
It contains the generated text, the tool calls that were made during the generation, and the results of the tool calls.
 */
export class GenerateTextResult<
  TOOLS extends Record<string, ExperimentalTool>,
> {
  /**
The generated text.
   */
  readonly text: string;

  /**
The tool calls that were made during the generation.
   */
  readonly toolCalls: ToToolCallArray<TOOLS>;

  /**
The results of the tool calls.
   */
  readonly toolResults: ToToolResultArray<TOOLS>;

  /**
The reason why the generation finished.
   */
  readonly finishReason: LanguageModelV1FinishReason;

  /**
The token usage of the generated text.
   */
  readonly usage: TokenUsage;

  /**
Warnings from the model provider (e.g. unsupported settings)
   */
  readonly warnings: LanguageModelV1CallWarning[] | undefined;

  constructor(options: {
    text: string;
    toolCalls: ToToolCallArray<TOOLS>;
    toolResults: ToToolResultArray<TOOLS>;
    finishReason: LanguageModelV1FinishReason;
    usage: TokenUsage;
    warnings: LanguageModelV1CallWarning[] | undefined;
  }) {
    this.text = options.text;
    this.toolCalls = options.toolCalls;
    this.toolResults = options.toolResults;
    this.finishReason = options.finishReason;
    this.usage = options.usage;
    this.warnings = options.warnings;
  }
}
