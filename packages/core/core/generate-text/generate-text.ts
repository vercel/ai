import { AttributeValue, Attributes, Tracer } from '@opentelemetry/api';
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
import { getTracer } from '../telemetry/get-tracer';
import { recordSpan } from '../telemetry/record-span';
import { TelemetrySettings } from '../telemetry/telemetry-settings';
import { CoreTool } from '../tool/tool';
import {
  CallWarning,
  CoreToolChoice,
  FinishReason,
  LanguageModel,
  LogProbs,
} from '../types';
import {
  CompletionTokenUsage,
  calculateCompletionTokenUsage,
} from '../types/token-usage';
import { retryWithExponentialBackoff } from '../util/retry-with-exponential-backoff';
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
  const baseTelemetryAttributes = {
    'ai.model.provider': model.provider,
    'ai.model.id': model.modelId,
    // settings:
    'ai.settings.maxRetries': maxRetries,
    ...Object.entries(settings ?? {}).reduce((attributes, [key, value]) => {
      attributes[`ai.settings.${key}`] = value;
      return attributes;
    }, {} as Record<string, AttributeValue>),
    // special telemetry information
    'operation.name': 'ai.generateText',
    'resource.name': telemetry?.functionId,
    'ai.telemetry.functionId': telemetry?.functionId,
    // add metadata as attributes:
    ...Object.entries(telemetry?.metadata ?? {}).reduce(
      (attributes, [key, value]) => {
        attributes[`ai.telemetry.metadata.${key}`] = value;
        return attributes;
      },
      {} as Attributes,
    ),
  };

  const tracer = getTracer({ isEnabled: telemetry?.isEnabled ?? false });
  return recordSpan(
    tracer,
    'ai.generateText',
    {
      ...baseTelemetryAttributes,
      // specific settings that only make sense on the outer level:
      'ai.prompt': JSON.stringify({ system, prompt, messages }),
      'ai.settings.maxToolRoundtrips': maxToolRoundtrips,
    },
    async span => {
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
      const promptMessages = convertToLanguageModelPrompt(validatedPrompt);

      let currentModelResponse: Awaited<
        ReturnType<LanguageModel['doGenerate']>
      >;
      let currentToolCalls: ToToolCallArray<TOOLS> = [];
      let currentToolResults: ToToolResultArray<TOOLS> = [];
      let roundtrips = 0;
      const responseMessages: Array<CoreAssistantMessage | CoreToolMessage> =
        [];

      do {
        // once we have a roundtrip, we need to switch to messages format:
        const currentInputFormat =
          roundtrips === 0 ? validatedPrompt.type : 'messages';

        currentModelResponse = await retry(() =>
          recordSpan(
            tracer,
            'ai.generateText.doGenerate',
            {
              ...baseTelemetryAttributes,
              'ai.prompt.format': currentInputFormat,
              'ai.prompt.messages': JSON.stringify(promptMessages),
            },
            async span => {
              const result = await model.doGenerate({
                mode,
                ...callSettings,
                inputFormat: currentInputFormat,
                prompt: promptMessages,
                abortSignal,
                headers,
              });

              // Add response information to the span:
              span.setAttributes({
                'ai.finishReason': result.finishReason,
                'ai.usage.promptTokens': result.usage.promptTokens,
                'ai.usage.completionTokens': result.usage.completionTokens,
                'ai.result.text': result.text,
                'ai.result.toolCalls': JSON.stringify(result.toolCalls),
              });

              return result;
            },
          ),
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
              });

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

      // Add response information to the span:
      span.setAttributes({
        'ai.finishReason': currentModelResponse.finishReason,
        'ai.usage.promptTokens': currentModelResponse.usage.promptTokens,
        'ai.usage.completionTokens':
          currentModelResponse.usage.completionTokens,
        'ai.result.text': currentModelResponse.text,
        'ai.result.toolCalls': JSON.stringify(currentModelResponse.toolCalls),
      });

      return new GenerateTextResult({
        // Always return a string so that the caller doesn't have to check for undefined.
        // If they need to check if the model did not return any text,
        // they can check the length of the string:
        text: currentModelResponse.text ?? '',
        toolCalls: currentToolCalls,
        toolResults: currentToolResults,
        finishReason: currentModelResponse.finishReason,
        usage: calculateCompletionTokenUsage(currentModelResponse.usage),
        warnings: currentModelResponse.warnings,
        rawResponse: currentModelResponse.rawResponse,
        logprobs: currentModelResponse.logprobs,
        responseMessages,
      });
    },
  );
}

async function executeTools<TOOLS extends Record<string, CoreTool>>({
  toolCalls,
  tools,
  tracer,
}: {
  toolCalls: ToToolCallArray<TOOLS>;
  tools: TOOLS;
  tracer: Tracer;
}): Promise<ToToolResultArray<TOOLS>> {
  const toolResults = await Promise.all(
    toolCalls.map(async toolCall => {
      const tool = tools[toolCall.toolName];

      if (tool?.execute == null) {
        return undefined;
      }

      const result = await recordSpan(
        tracer,
        'ai.generateText.toolCall',
        {
          'ai.toolCall.name': toolCall.toolName,
          'ai.toolCall.id': toolCall.toolCallId,
          'ai.toolCall.args': JSON.stringify(toolCall.args),
        },
        async span => {
          const result = await tool.execute!(toolCall.args);

          try {
            span.setAttributes({
              'ai.toolCall.result': JSON.stringify(result),
            });
          } catch (ignored) {
            // JSON stringify might fail if the result is not serializable,
            // in which case we just ignore it. In the future we might want to
            // add an optional serialize method to the tool interface and warn
            // if the result is not serializable.
          }

          return result;
        },
      );

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
  readonly usage: CompletionTokenUsage;

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
    usage: CompletionTokenUsage;
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
