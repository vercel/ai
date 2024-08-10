import { Tracer } from '@opentelemetry/api';
import { retryWithExponentialBackoff } from '../../util/retry-with-exponential-backoff';
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
import { assembleOperationName } from '../telemetry/assemble-operation-name';
import { getBaseTelemetryAttributes } from '../telemetry/get-base-telemetry-attributes';
import { getTracer } from '../telemetry/get-tracer';
import { recordSpan } from '../telemetry/record-span';
import { selectTelemetryAttributes } from '../telemetry/select-telemetry-attributes';
import { TelemetrySettings } from '../telemetry/telemetry-settings';
import { CoreTool } from '../tool/tool';
import { CoreToolChoice, LanguageModel } from '../types';
import {
  CompletionTokenUsage,
  calculateCompletionTokenUsage,
} from '../types/token-usage';
import { GenerateTextResult } from './generate-text-result';
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
@param topK - Only sample from the top K options for each subsequent token.
Used to remove "long tail" low probability responses.
Recommended for advanced use cases only. You usually only need to use temperature.
@param presencePenalty - Presence penalty setting.
It affects the likelihood of the model to repeat information that is already in the prompt.
The value is passed through to the provider. The range depends on the provider and model.
@param frequencyPenalty - Frequency penalty setting.
It affects the likelihood of the model to repeatedly use the same words or phrases.
The value is passed through to the provider. The range depends on the provider and model.
@param stopSequences - Stop sequences.
If set, the model will stop generating text when one of the stop sequences is generated.
@param seed - The seed (integer) to use for random sampling.
If set and supported by the model, calls will generate deterministic results.

@param maxRetries - Maximum number of retries. Set to 0 to disable retries. Default: 2.
@param abortSignal - An optional abort signal that can be used to cancel the call.
@param headers - Additional HTTP headers to be sent with the request. Only applicable for HTTP-based providers.

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
  headers,
  maxAutomaticRoundtrips = 0,
  maxToolRoundtrips = maxAutomaticRoundtrips,
  experimental_telemetry: telemetry,
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

    /**
     * Optional telemetry configuration (experimental).
     */
    experimental_telemetry?: TelemetrySettings;
  }): Promise<GenerateTextResult<TOOLS>> {
  const baseTelemetryAttributes = getBaseTelemetryAttributes({
    model,
    telemetry,
    headers,
    settings: { ...settings, maxRetries },
  });

  const tracer = getTracer({ isEnabled: telemetry?.isEnabled ?? false });
  return recordSpan({
    name: 'ai.generateText',
    attributes: selectTelemetryAttributes({
      telemetry,
      attributes: {
        ...assembleOperationName({
          operationName: 'ai.generateText',
          telemetry,
        }),
        ...baseTelemetryAttributes,
        // specific settings that only make sense on the outer level:
        'ai.prompt': {
          input: () => JSON.stringify({ system, prompt, messages }),
        },
        'ai.settings.maxToolRoundtrips': maxToolRoundtrips,
      },
    }),
    tracer,
    fn: async span => {
      const retry = retryWithExponentialBackoff({ maxRetries });
      const validatedPrompt = getValidatedPrompt({
        system,
        prompt,
        messages,
      });

      const mode = {
        type: 'regular' as const,
        ...prepareToolsAndToolChoice({ tools, toolChoice }),
      };
      const callSettings = prepareCallSettings(settings);
      const promptMessages = await convertToLanguageModelPrompt({
        prompt: validatedPrompt,
        modelSupportsImageUrls: model.supportsImageUrls,
      });

      let currentModelResponse: Awaited<
        ReturnType<LanguageModel['doGenerate']>
      >;
      let currentToolCalls: ToToolCallArray<TOOLS> = [];
      let currentToolResults: ToToolResultArray<TOOLS> = [];
      let roundtripCount = 0;
      const responseMessages: Array<CoreAssistantMessage | CoreToolMessage> =
        [];
      const roundtrips: GenerateTextResult<TOOLS>['roundtrips'] = [];
      const usage: CompletionTokenUsage = {
        completionTokens: 0,
        promptTokens: 0,
        totalTokens: 0,
      };

      do {
        // once we have a roundtrip, we need to switch to messages format:
        const currentInputFormat =
          roundtripCount === 0 ? validatedPrompt.type : 'messages';

        currentModelResponse = await retry(() =>
          recordSpan({
            name: 'ai.generateText.doGenerate',
            attributes: selectTelemetryAttributes({
              telemetry,
              attributes: {
                ...assembleOperationName({
                  operationName: 'ai.generateText.doGenerate',
                  telemetry,
                }),
                ...baseTelemetryAttributes,
                'ai.prompt.format': { input: () => currentInputFormat },
                'ai.prompt.messages': {
                  input: () => JSON.stringify(promptMessages),
                },

                // standardized gen-ai llm span attributes:
                'gen_ai.request.model': model.modelId,
                'gen_ai.system': model.provider,
                'gen_ai.request.max_tokens': settings.maxTokens,
                'gen_ai.request.temperature': settings.temperature,
                'gen_ai.request.top_p': settings.topP,
              },
            }),
            tracer,
            fn: async span => {
              const result = await model.doGenerate({
                mode,
                ...callSettings,
                inputFormat: currentInputFormat,
                prompt: promptMessages,
                abortSignal,
                headers,
              });

              // Add response information to the span:
              span.setAttributes(
                selectTelemetryAttributes({
                  telemetry,
                  attributes: {
                    'ai.finishReason': result.finishReason,
                    'ai.usage.promptTokens': result.usage.promptTokens,
                    'ai.usage.completionTokens': result.usage.completionTokens,
                    'ai.result.text': {
                      output: () => result.text,
                    },
                    'ai.result.toolCalls': {
                      output: () => JSON.stringify(result.toolCalls),
                    },

                    // standardized gen-ai llm span attributes:
                    'gen_ai.response.finish_reasons': [result.finishReason],
                    'gen_ai.usage.prompt_tokens': result.usage.promptTokens,
                    'gen_ai.usage.completion_tokens':
                      result.usage.completionTokens,
                  },
                }),
              );

              return result;
            },
          }),
        );

        // parse tool calls:
        currentToolCalls = (currentModelResponse.toolCalls ?? []).map(
          modelToolCall => parseToolCall({ toolCall: modelToolCall, tools }),
        );

        // execute tools:
        currentToolResults =
          tools == null
            ? []
            : await executeTools({
                toolCalls: currentToolCalls,
                tools,
                tracer,
                telemetry,
              });

        // token usage:
        const currentUsage = calculateCompletionTokenUsage(
          currentModelResponse.usage,
        );
        usage.completionTokens += currentUsage.completionTokens;
        usage.promptTokens += currentUsage.promptTokens;
        usage.totalTokens += currentUsage.totalTokens;

        // add roundtrip information:
        roundtrips.push({
          text: currentModelResponse.text ?? '',
          toolCalls: currentToolCalls,
          toolResults: currentToolResults,
          finishReason: currentModelResponse.finishReason,
          usage: currentUsage,
          warnings: currentModelResponse.warnings,
          logprobs: currentModelResponse.logprobs,
        });

        // append to messages for potential next roundtrip:
        const newResponseMessages = toResponseMessages({
          text: currentModelResponse.text ?? '',
          toolCalls: currentToolCalls,
          toolResults: currentToolResults,
        });
        responseMessages.push(...newResponseMessages);
        promptMessages.push(
          ...newResponseMessages.map(message =>
            convertToLanguageModelMessage(message, null),
          ),
        );
      } while (
        // there are tool calls:
        currentToolCalls.length > 0 &&
        // all current tool calls have results:
        currentToolResults.length === currentToolCalls.length &&
        // the number of roundtrips is less than the maximum:
        roundtripCount++ < maxToolRoundtrips
      );

      // Add response information to the span:
      span.setAttributes(
        selectTelemetryAttributes({
          telemetry,
          attributes: {
            'ai.finishReason': currentModelResponse.finishReason,
            'ai.usage.promptTokens': currentModelResponse.usage.promptTokens,
            'ai.usage.completionTokens':
              currentModelResponse.usage.completionTokens,
            'ai.result.text': {
              output: () => currentModelResponse.text,
            },
            'ai.result.toolCalls': {
              output: () => JSON.stringify(currentModelResponse.toolCalls),
            },
          },
        }),
      );

      return new DefaultGenerateTextResult({
        // Always return a string so that the caller doesn't have to check for undefined.
        // If they need to check if the model did not return any text,
        // they can check the length of the string:
        text: currentModelResponse.text ?? '',
        toolCalls: currentToolCalls,
        toolResults: currentToolResults,
        finishReason: currentModelResponse.finishReason,
        usage,
        warnings: currentModelResponse.warnings,
        rawResponse: currentModelResponse.rawResponse,
        logprobs: currentModelResponse.logprobs,
        responseMessages,
        roundtrips,
      });
    },
  });
}

async function executeTools<TOOLS extends Record<string, CoreTool>>({
  toolCalls,
  tools,
  tracer,
  telemetry,
}: {
  toolCalls: ToToolCallArray<TOOLS>;
  tools: TOOLS;
  tracer: Tracer;
  telemetry: TelemetrySettings | undefined;
}): Promise<ToToolResultArray<TOOLS>> {
  const toolResults = await Promise.all(
    toolCalls.map(async toolCall => {
      const tool = tools[toolCall.toolName];

      if (tool?.execute == null) {
        return undefined;
      }

      const result = await recordSpan({
        name: 'ai.toolCall',
        attributes: selectTelemetryAttributes({
          telemetry,
          attributes: {
            ...assembleOperationName({
              operationName: 'ai.toolCall',
              telemetry,
            }),
            'ai.toolCall.name': toolCall.toolName,
            'ai.toolCall.id': toolCall.toolCallId,
            'ai.toolCall.args': {
              output: () => JSON.stringify(toolCall.args),
            },
          },
        }),
        tracer,
        fn: async span => {
          const result = await tool.execute!(toolCall.args);

          try {
            span.setAttributes(
              selectTelemetryAttributes({
                telemetry,
                attributes: {
                  'ai.toolCall.result': {
                    output: () => JSON.stringify(result),
                  },
                },
              }),
            );
          } catch (ignored) {
            // JSON stringify might fail if the result is not serializable,
            // in which case we just ignore it. In the future we might want to
            // add an optional serialize method to the tool interface and warn
            // if the result is not serializable.
          }

          return result;
        },
      });

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

class DefaultGenerateTextResult<TOOLS extends Record<string, CoreTool>>
  implements GenerateTextResult<TOOLS>
{
  readonly text: GenerateTextResult<TOOLS>['text'];
  readonly toolCalls: GenerateTextResult<TOOLS>['toolCalls'];
  readonly toolResults: GenerateTextResult<TOOLS>['toolResults'];
  readonly finishReason: GenerateTextResult<TOOLS>['finishReason'];
  readonly usage: GenerateTextResult<TOOLS>['usage'];
  readonly warnings: GenerateTextResult<TOOLS>['warnings'];
  readonly responseMessages: GenerateTextResult<TOOLS>['responseMessages'];
  readonly roundtrips: GenerateTextResult<TOOLS>['roundtrips'];
  readonly rawResponse: GenerateTextResult<TOOLS>['rawResponse'];
  readonly logprobs: GenerateTextResult<TOOLS>['logprobs'];

  constructor(options: {
    text: GenerateTextResult<TOOLS>['text'];
    toolCalls: GenerateTextResult<TOOLS>['toolCalls'];
    toolResults: GenerateTextResult<TOOLS>['toolResults'];
    finishReason: GenerateTextResult<TOOLS>['finishReason'];
    usage: GenerateTextResult<TOOLS>['usage'];
    warnings: GenerateTextResult<TOOLS>['warnings'];
    rawResponse?: GenerateTextResult<TOOLS>['rawResponse'];
    logprobs: GenerateTextResult<TOOLS>['logprobs'];
    responseMessages: GenerateTextResult<TOOLS>['responseMessages'];
    roundtrips: GenerateTextResult<TOOLS>['roundtrips'];
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
    this.roundtrips = options.roundtrips;
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
