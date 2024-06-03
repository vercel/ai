import { CoreAssistantMessage, CoreToolMessage } from '../prompt';
import { CallSettings } from '../prompt/call-settings';
import {
  convertToLanguageModelMessage,
  convertToLanguageModelPrompt,
} from '../prompt/convert-to-language-model-prompt';
import { getValidatedPrompt } from '../prompt/get-validated-prompt';
import { prepareCallSettings } from '../prompt/prepare-call-settings';
import { prepareToolsAndToolChoice } from '../prompt/prepare-tools-and-tool-choice';
import { Prompt } from '../prompt/prompt';
import { CoreTool } from '../tool/tool';
import {
  CallWarning,
  CoreToolChoice,
  FinishReason,
  LanguageModel,
  LogProbs,
} from '../types';
import { retryWithExponentialBackoff } from '../util/retry-with-exponential-backoff';
import { TokenUsage, calculateTokenUsage } from './token-usage';
import { ToToolCallArray, parseToolCall } from './tool-call';
import { ToToolResultArray } from './tool-result';

/**
Generate a text and call tools for a given prompt using a language model.

This function does not stream the output. If you want to stream the output, use `streamText` instead.

@param model - The language model to use.

@param tools - Tools that are accessible to and can be called by the model. The model needs to support calling tools.
@param toolChoice - The tool choice strategy. Default: 'auto'.

@param system - A system message that will be part of the prompt.
@param prompt - A simple text prompt. You can either use `prompt` or `messages` but not both.
@param messages - A list of messages. You can either use `prompt` or `messages` but not both.

@param maxTokens - Maximum number of tokens to generate.
@param temperature - Temperature setting.
The value is passed through to the provider. The range depends on the provider and model.
It is recommended to set either `temperature` or `topP`, but not both.
@param topP - Nucleus sampling.
The value is passed through to the provider. The range depends on the provider and model.
It is recommended to set either `temperature` or `topP`, but not both.
@param presencePenalty - Presence penalty setting. 
It affects the likelihood of the model to repeat information that is already in the prompt.
The value is passed through to the provider. The range depends on the provider and model.
@param frequencyPenalty - Frequency penalty setting.
It affects the likelihood of the model to repeatedly use the same words or phrases.
The value is passed through to the provider. The range depends on the provider and model.
@param seed - The seed (integer) to use for random sampling.
If set and supported by the model, calls will generate deterministic results.

@param maxRetries - Maximum number of retries. Set to 0 to disable retries. Default: 2.
@param abortSignal - An optional abort signal that can be used to cancel the call.

@param maxToolRoundtrips - Maximal number of automatic roundtrips for tool calls.

@returns
A result object that contains the generated text, the results of the tool calls, and additional information.
 */
export async function generateText<TOOLS extends Record<string, CoreTool>>({
  model,
  tools,
  toolChoice,
  system,
  prompt,
  messages,
  maxRetries,
  abortSignal,
  maxAutomaticRoundtrips = 0,
  maxToolRoundtrips = maxAutomaticRoundtrips,
  ...settings
}: CallSettings &
  Prompt & {
    /**
The language model to use.
     */
    model: LanguageModel;

    /**
The tools that the model can call. The model needs to support calling tools.
*/
    tools?: TOOLS;

    /**
The tool choice strategy. Default: 'auto'.
     */
    toolChoice?: CoreToolChoice<TOOLS>;

    /**
@deprecated Use `maxToolRoundtrips` instead.
     */
    maxAutomaticRoundtrips?: number;

    /**
Maximal number of automatic roundtrips for tool calls.

An automatic tool call roundtrip is another LLM call with the 
tool call results when all tool calls of the last assistant 
message have results.

A maximum number is required to prevent infinite loops in the
case of misconfigured tools.

By default, it's set to 0, which will disable the feature.
     */
    maxToolRoundtrips?: number;
  }): Promise<GenerateTextResult<TOOLS>> {
  const retry = retryWithExponentialBackoff({ maxRetries });
  const validatedPrompt = getValidatedPrompt({ system, prompt, messages });

  const mode = {
    type: 'regular' as const,
    ...prepareToolsAndToolChoice({ tools, toolChoice }),
  };
  const callSettings = prepareCallSettings(settings);
  const promptMessages = convertToLanguageModelPrompt(validatedPrompt);

  let currentModelResponse: Awaited<ReturnType<LanguageModel['doGenerate']>>;
  let currentToolCalls: ToToolCallArray<TOOLS> = [];
  let currentToolResults: ToToolResultArray<TOOLS> = [];
  let roundtrips = 0;
  const responseMessages: Array<CoreAssistantMessage | CoreToolMessage> = [];

  do {
    currentModelResponse = await retry(() => {
      return model.doGenerate({
        mode,
        ...callSettings,
        // once we have a roundtrip, we need to switch to messages format:
        inputFormat: roundtrips === 0 ? validatedPrompt.type : 'messages',
        prompt: promptMessages,
        abortSignal,
      });
    });

    // parse tool calls:
    currentToolCalls = (currentModelResponse.toolCalls ?? []).map(
      modelToolCall => parseToolCall({ toolCall: modelToolCall, tools }),
    );

    // execute tools:
    currentToolResults =
      tools == null
        ? []
        : await executeTools({ toolCalls: currentToolCalls, tools });

    // append to messages for potential next roundtrip:
    const newResponseMessages = toResponseMessages({
      text: currentModelResponse.text ?? '',
      toolCalls: currentToolCalls,
      toolResults: currentToolResults,
    });
    responseMessages.push(...newResponseMessages);
    promptMessages.push(
      ...newResponseMessages.map(convertToLanguageModelMessage),
    );
  } while (
    // there are tool calls:
    currentToolCalls.length > 0 &&
    // all current tool calls have results:
    currentToolResults.length === currentToolCalls.length &&
    // the number of roundtrips is less than the maximum:
    roundtrips++ < maxToolRoundtrips
  );

  return new GenerateTextResult({
    // Always return a string so that the caller doesn't have to check for undefined.
    // If they need to check if the model did not return any text,
    // they can check the length of the string:
    text: currentModelResponse.text ?? '',
    toolCalls: currentToolCalls,
    toolResults: currentToolResults,
    finishReason: currentModelResponse.finishReason,
    usage: calculateTokenUsage(currentModelResponse.usage),
    warnings: currentModelResponse.warnings,
    rawResponse: currentModelResponse.rawResponse,
    logprobs: currentModelResponse.logprobs,
    responseMessages,
  });
}

async function executeTools<TOOLS extends Record<string, CoreTool>>({
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
export class GenerateTextResult<TOOLS extends Record<string, CoreTool>> {
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
  readonly finishReason: FinishReason;

  /**
The token usage of the generated text.
   */
  readonly usage: TokenUsage;

  /**
Warnings from the model provider (e.g. unsupported settings)
   */
  readonly warnings: CallWarning[] | undefined;

  /**
The response messages that were generated during the call. It consists of an assistant message,
potentially containing tool calls. 
When there are tool results, there is an additional tool message with the tool results that are available.
If there are tools that do not have execute functions, they are not included in the tool results and
need to be added separately.
   */
  readonly responseMessages: Array<CoreAssistantMessage | CoreToolMessage>;

  /**
Optional raw response data.
   */
  rawResponse?: {
    /**
Response headers.
   */
    headers?: Record<string, string>;
  };

  /**
Logprobs for the completion. 
`undefined` if the mode does not support logprobs or if was not enabled
   */
  readonly logprobs: LogProbs | undefined;

  constructor(options: {
    text: string;
    toolCalls: ToToolCallArray<TOOLS>;
    toolResults: ToToolResultArray<TOOLS>;
    finishReason: FinishReason;
    usage: TokenUsage;
    warnings: CallWarning[] | undefined;
    rawResponse?: {
      headers?: Record<string, string>;
    };
    logprobs: LogProbs | undefined;
    responseMessages: Array<CoreAssistantMessage | CoreToolMessage>;
  }) {
    this.text = options.text;
    this.toolCalls = options.toolCalls;
    this.toolResults = options.toolResults;
    this.finishReason = options.finishReason;
    this.usage = options.usage;
    this.warnings = options.warnings;
    this.rawResponse = options.rawResponse;
    this.logprobs = options.logprobs;
    this.responseMessages = options.responseMessages;
  }
}

/**
Converts the result of a `generateText` call to a list of response messages.
 */
function toResponseMessages<TOOLS extends Record<string, CoreTool>>({
  text,
  toolCalls,
  toolResults,
}: {
  text: string;
  toolCalls: ToToolCallArray<TOOLS>;
  toolResults: ToToolResultArray<TOOLS>;
}): Array<CoreAssistantMessage | CoreToolMessage> {
  const responseMessages: Array<CoreAssistantMessage | CoreToolMessage> = [];

  responseMessages.push({
    role: 'assistant',
    content: [{ type: 'text', text }, ...toolCalls],
  });

  if (toolResults.length > 0) {
    responseMessages.push({
      role: 'tool',
      content: toolResults.map(result => ({
        type: 'tool-result',
        toolCallId: result.toolCallId,
        toolName: result.toolName,
        result: result.result,
      })),
    });
  }

  return responseMessages;
}

/**
 * @deprecated Use `generateText` instead.
 */
export const experimental_generateText = generateText;
