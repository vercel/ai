import { createIdGenerator } from '@ai-sdk/provider-utils';
import { Tracer } from '@opentelemetry/api';
import { InvalidArgumentError, ToolExecutionError } from '../../errors';
import { CoreAssistantMessage, CoreMessage, CoreToolMessage } from '../prompt';
import { CallSettings } from '../prompt/call-settings';
import { convertToLanguageModelPrompt } from '../prompt/convert-to-language-model-prompt';
import { prepareCallSettings } from '../prompt/prepare-call-settings';
import { prepareRetries } from '../prompt/prepare-retries';
import { prepareToolsAndToolChoice } from '../prompt/prepare-tools-and-tool-choice';
import { Prompt } from '../prompt/prompt';
import { standardizePrompt } from '../prompt/standardize-prompt';
import { assembleOperationName } from '../telemetry/assemble-operation-name';
import { getBaseTelemetryAttributes } from '../telemetry/get-base-telemetry-attributes';
import { getTracer } from '../telemetry/get-tracer';
import { recordSpan } from '../telemetry/record-span';
import { selectTelemetryAttributes } from '../telemetry/select-telemetry-attributes';
import { TelemetrySettings } from '../telemetry/telemetry-settings';
import { CoreTool } from '../tool/tool';
import { CoreToolChoice, LanguageModel, ProviderMetadata } from '../types';
import {
  LanguageModelUsage,
  addLanguageModelUsage,
  calculateLanguageModelUsage,
} from '../types/usage';
import { removeTextAfterLastWhitespace } from '../util/remove-text-after-last-whitespace';
import { GenerateTextResult } from './generate-text-result';
import { Output } from './output';
import { parseToolCall } from './parse-tool-call';
import { StepResult } from './step-result';
import { toResponseMessages } from './to-response-messages';
import { ToolCallArray } from './tool-call';
import { ToolCallRepairFunction } from './tool-call-repair';
import { ToolResultArray } from './tool-result';

const originalGenerateId = createIdGenerator({ prefix: 'aitxt', size: 24 });

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

@param maxSteps - Maximum number of sequential LLM calls (steps), e.g. when you use tool calls.

@param onStepFinish - Callback that is called when each step (LLM call) is finished, including intermediate steps.

@returns
A result object that contains the generated text, the results of the tool calls, and additional information.
 */
export async function generateText<
  TOOLS extends Record<string, CoreTool>,
  OUTPUT = never,
>({
  model,
  tools,
  toolChoice,
  system,
  prompt,
  messages,
  maxRetries: maxRetriesArg,
  abortSignal,
  headers,
  maxSteps = 1,
  experimental_output: output,
  experimental_continueSteps: continueSteps = false,
  experimental_telemetry: telemetry,
  experimental_providerMetadata: providerMetadata,
  experimental_activeTools: activeTools,
  experimental_repairToolCall: repairToolCall,
  _internal: {
    generateId = originalGenerateId,
    currentDate = () => new Date(),
  } = {},
  onStepFinish,
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
Maximum number of sequential LLM calls (steps), e.g. when you use tool calls. Must be at least 1.

A maximum number is required to prevent infinite loops in the case of misconfigured tools.

By default, it's set to 1, which means that only a single LLM call is made.
     */
    maxSteps?: number;

    /**
When enabled, the model will perform additional steps if the finish reason is "length" (experimental).

By default, it's set to false.
     */
    experimental_continueSteps?: boolean;

    /**
Optional telemetry configuration (experimental).
     */
    experimental_telemetry?: TelemetrySettings;

    /**
Additional provider-specific metadata. They are passed through
to the provider from the AI SDK and enable provider-specific
functionality that can be fully encapsulated in the provider.
 */
    experimental_providerMetadata?: ProviderMetadata;

    /**
Limits the tools that are available for the model to call without
changing the tool call and result types in the result.
     */
    experimental_activeTools?: Array<keyof TOOLS>;

    experimental_output?: Output<OUTPUT>;

    /**
A function that attempts to repair a tool call that failed to parse.
     */
    experimental_repairToolCall?: ToolCallRepairFunction<TOOLS>;

    /**
    Callback that is called when each step (LLM call) is finished, including intermediate steps.
    */
    onStepFinish?: (event: StepResult<TOOLS>) => Promise<void> | void;

    /**
     * Internal. For test use only. May change without notice.
     */
    _internal?: {
      generateId?: () => string;
      currentDate?: () => Date;
    };
  }): Promise<GenerateTextResult<TOOLS, OUTPUT>> {
  if (maxSteps < 1) {
    throw new InvalidArgumentError({
      parameter: 'maxSteps',
      value: maxSteps,
      message: 'maxSteps must be at least 1',
    });
  }

  const { maxRetries, retry } = prepareRetries({ maxRetries: maxRetriesArg });

  const baseTelemetryAttributes = getBaseTelemetryAttributes({
    model,
    telemetry,
    headers,
    settings: { ...settings, maxRetries },
  });

  const initialPrompt = standardizePrompt({
    prompt: {
      system: output?.injectIntoSystemPrompt({ system, model }) ?? system,
      prompt,
      messages,
    },
    tools,
  });

  const tracer = getTracer(telemetry);

  return recordSpan({
    name: 'ai.generateText',
    attributes: selectTelemetryAttributes({
      telemetry,
      attributes: {
        ...assembleOperationName({
          operationId: 'ai.generateText',
          telemetry,
        }),
        ...baseTelemetryAttributes,
        // specific settings that only make sense on the outer level:
        'ai.prompt': {
          input: () => JSON.stringify({ system, prompt, messages }),
        },
        'ai.settings.maxSteps': maxSteps,
      },
    }),
    tracer,
    fn: async span => {
      const mode = {
        type: 'regular' as const,
        ...prepareToolsAndToolChoice({ tools, toolChoice, activeTools }),
      };

      const callSettings = prepareCallSettings(settings);

      let currentModelResponse: Awaited<
        ReturnType<LanguageModel['doGenerate']>
      > & { response: { id: string; timestamp: Date; modelId: string } };
      let currentToolCalls: ToolCallArray<TOOLS> = [];
      let currentToolResults: ToolResultArray<TOOLS> = [];
      let stepCount = 0;
      const responseMessages: Array<CoreAssistantMessage | CoreToolMessage> =
        [];
      let text = '';
      const steps: GenerateTextResult<TOOLS, OUTPUT>['steps'] = [];
      let usage: LanguageModelUsage = {
        completionTokens: 0,
        promptTokens: 0,
        totalTokens: 0,
      };

      let stepType: 'initial' | 'tool-result' | 'continue' | 'done' = 'initial';

      do {
        // after the 1st step, we need to switch to messages format:
        const promptFormat = stepCount === 0 ? initialPrompt.type : 'messages';

        const stepInputMessages = [
          ...initialPrompt.messages,
          ...responseMessages,
        ];

        const promptMessages = await convertToLanguageModelPrompt({
          prompt: {
            type: promptFormat,
            system: initialPrompt.system,
            messages: stepInputMessages,
          },
          modelSupportsImageUrls: model.supportsImageUrls,
          modelSupportsUrl: model.supportsUrl,
        });

        currentModelResponse = await retry(() =>
          recordSpan({
            name: 'ai.generateText.doGenerate',
            attributes: selectTelemetryAttributes({
              telemetry,
              attributes: {
                ...assembleOperationName({
                  operationId: 'ai.generateText.doGenerate',
                  telemetry,
                }),
                ...baseTelemetryAttributes,
                'ai.prompt.format': { input: () => promptFormat },
                'ai.prompt.messages': {
                  input: () => JSON.stringify(promptMessages),
                },
                'ai.prompt.tools': {
                  // convert the language model level tools:
                  input: () => mode.tools?.map(tool => JSON.stringify(tool)),
                },
                'ai.prompt.toolChoice': {
                  input: () =>
                    mode.toolChoice != null
                      ? JSON.stringify(mode.toolChoice)
                      : undefined,
                },

                // standardized gen-ai llm span attributes:
                'gen_ai.system': model.provider,
                'gen_ai.request.model': model.modelId,
                'gen_ai.request.frequency_penalty': settings.frequencyPenalty,
                'gen_ai.request.max_tokens': settings.maxTokens,
                'gen_ai.request.presence_penalty': settings.presencePenalty,
                'gen_ai.request.stop_sequences': settings.stopSequences,
                'gen_ai.request.temperature': settings.temperature,
                'gen_ai.request.top_k': settings.topK,
                'gen_ai.request.top_p': settings.topP,
              },
            }),
            tracer,
            fn: async span => {
              const result = await model.doGenerate({
                mode,
                ...callSettings,
                inputFormat: promptFormat,
                responseFormat: output?.responseFormat({ model }),
                prompt: promptMessages,
                providerMetadata,
                abortSignal,
                headers,
              });

              // Fill in default values:
              const responseData = {
                id: result.response?.id ?? generateId(),
                timestamp: result.response?.timestamp ?? currentDate(),
                modelId: result.response?.modelId ?? model.modelId,
              };

              // Add response information to the span:
              span.setAttributes(
                selectTelemetryAttributes({
                  telemetry,
                  attributes: {
                    'ai.response.finishReason': result.finishReason,
                    'ai.response.text': {
                      output: () => result.text,
                    },
                    'ai.response.toolCalls': {
                      output: () => JSON.stringify(result.toolCalls),
                    },
                    'ai.response.id': responseData.id,
                    'ai.response.model': responseData.modelId,
                    'ai.response.timestamp':
                      responseData.timestamp.toISOString(),

                    'ai.usage.promptTokens': result.usage.promptTokens,
                    'ai.usage.completionTokens': result.usage.completionTokens,

                    // standardized gen-ai llm span attributes:
                    'gen_ai.response.finish_reasons': [result.finishReason],
                    'gen_ai.response.id': responseData.id,
                    'gen_ai.response.model': responseData.modelId,
                    'gen_ai.usage.input_tokens': result.usage.promptTokens,
                    'gen_ai.usage.output_tokens': result.usage.completionTokens,
                  },
                }),
              );

              return { ...result, response: responseData };
            },
          }),
        );

        // parse tool calls:
        currentToolCalls = await Promise.all(
          (currentModelResponse.toolCalls ?? []).map(toolCall =>
            parseToolCall({
              toolCall,
              tools,
              repairToolCall,
              system,
              messages: stepInputMessages,
            }),
          ),
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
                messages: stepInputMessages,
                abortSignal,
              });

        // token usage:
        const currentUsage = calculateLanguageModelUsage(
          currentModelResponse.usage,
        );
        usage = addLanguageModelUsage(usage, currentUsage);

        // check if another step is needed:
        let nextStepType: 'done' | 'continue' | 'tool-result' = 'done';
        if (++stepCount < maxSteps) {
          if (
            continueSteps &&
            currentModelResponse.finishReason === 'length' &&
            // only use continue when there are no tool calls:
            currentToolCalls.length === 0
          ) {
            nextStepType = 'continue';
          } else if (
            // there are tool calls:
            currentToolCalls.length > 0 &&
            // all current tool calls have results:
            currentToolResults.length === currentToolCalls.length
          ) {
            nextStepType = 'tool-result';
          }
        }

        // text:
        const originalText = currentModelResponse.text ?? '';
        const stepTextLeadingWhitespaceTrimmed =
          stepType === 'continue' && // only for continue steps
          text.trimEnd() !== text // only trim when there is preceding whitespace
            ? originalText.trimStart()
            : originalText;
        const stepText =
          nextStepType === 'continue'
            ? removeTextAfterLastWhitespace(stepTextLeadingWhitespaceTrimmed)
            : stepTextLeadingWhitespaceTrimmed;

        text =
          nextStepType === 'continue' || stepType === 'continue'
            ? text + stepText
            : stepText;

        // append to messages for potential next step:
        if (stepType === 'continue') {
          // continue step: update the last assistant message
          // continue is only possible when there are no tool calls,
          // so we can assume that there is a single last assistant message:
          const lastMessage = responseMessages[
            responseMessages.length - 1
          ] as CoreAssistantMessage;

          if (typeof lastMessage.content === 'string') {
            lastMessage.content += stepText;
          } else {
            lastMessage.content.push({
              text: stepText,
              type: 'text',
            });
          }
        } else {
          responseMessages.push(
            ...toResponseMessages({
              text,
              tools: tools ?? ({} as TOOLS),
              toolCalls: currentToolCalls,
              toolResults: currentToolResults,
            }),
          );
        }

        // Add step information (after response messages are updated):
        const currentStepResult: StepResult<TOOLS> = {
          stepType,
          text: stepText,
          toolCalls: currentToolCalls,
          toolResults: currentToolResults,
          finishReason: currentModelResponse.finishReason,
          usage: currentUsage,
          warnings: currentModelResponse.warnings,
          logprobs: currentModelResponse.logprobs,
          request: currentModelResponse.request ?? {},
          response: {
            ...currentModelResponse.response,
            headers: currentModelResponse.rawResponse?.headers,

            // deep clone msgs to avoid mutating past messages in multi-step:
            messages: JSON.parse(JSON.stringify(responseMessages)),
          },
          experimental_providerMetadata: currentModelResponse.providerMetadata,
          isContinued: nextStepType === 'continue',
        };
        steps.push(currentStepResult);
        await onStepFinish?.(currentStepResult);

        stepType = nextStepType;
      } while (stepType !== 'done');

      // Add response information to the span:
      span.setAttributes(
        selectTelemetryAttributes({
          telemetry,
          attributes: {
            'ai.response.finishReason': currentModelResponse.finishReason,
            'ai.response.text': {
              output: () => currentModelResponse.text,
            },
            'ai.response.toolCalls': {
              output: () => JSON.stringify(currentModelResponse.toolCalls),
            },

            'ai.usage.promptTokens': currentModelResponse.usage.promptTokens,
            'ai.usage.completionTokens':
              currentModelResponse.usage.completionTokens,
          },
        }),
      );

      return new DefaultGenerateTextResult({
        text,
        output:
          output == null
            ? (undefined as never)
            : output.parseOutput(
                { text },
                {
                  response: currentModelResponse.response,
                  usage,
                },
              ),
        toolCalls: currentToolCalls,
        toolResults: currentToolResults,
        finishReason: currentModelResponse.finishReason,
        usage,
        warnings: currentModelResponse.warnings,
        request: currentModelResponse.request ?? {},
        response: {
          ...currentModelResponse.response,
          headers: currentModelResponse.rawResponse?.headers,
          messages: responseMessages,
        },
        logprobs: currentModelResponse.logprobs,
        steps,
        providerMetadata: currentModelResponse.providerMetadata,
      });
    },
  });
}

async function executeTools<TOOLS extends Record<string, CoreTool>>({
  toolCalls,
  tools,
  tracer,
  telemetry,
  messages,
  abortSignal,
}: {
  toolCalls: ToolCallArray<TOOLS>;
  tools: TOOLS;
  tracer: Tracer;
  telemetry: TelemetrySettings | undefined;
  messages: CoreMessage[];
  abortSignal: AbortSignal | undefined;
}): Promise<ToolResultArray<TOOLS>> {
  const toolResults = await Promise.all(
    toolCalls.map(async ({ toolCallId, toolName, args }) => {
      const tool = tools[toolName];

      if (tool?.execute == null) {
        return undefined;
      }

      const result = await recordSpan({
        name: 'ai.toolCall',
        attributes: selectTelemetryAttributes({
          telemetry,
          attributes: {
            ...assembleOperationName({
              operationId: 'ai.toolCall',
              telemetry,
            }),
            'ai.toolCall.name': toolName,
            'ai.toolCall.id': toolCallId,
            'ai.toolCall.args': {
              output: () => JSON.stringify(args),
            },
          },
        }),
        tracer,
        fn: async span => {
          try {
            const result = await tool.execute!(args, {
              toolCallId,
              messages,
              abortSignal,
            });

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
          } catch (error) {
            throw new ToolExecutionError({
              toolName,
              toolArgs: args,
              cause: error,
            });
          }
        },
      });

      return {
        type: 'tool-result',
        toolCallId,
        toolName,
        args,
        result,
      } as ToolResultArray<TOOLS>[number];
    }),
  );

  return toolResults.filter(
    (result): result is NonNullable<typeof result> => result != null,
  );
}

class DefaultGenerateTextResult<TOOLS extends Record<string, CoreTool>, OUTPUT>
  implements GenerateTextResult<TOOLS, OUTPUT>
{
  readonly text: GenerateTextResult<TOOLS, OUTPUT>['text'];
  readonly toolCalls: GenerateTextResult<TOOLS, OUTPUT>['toolCalls'];
  readonly toolResults: GenerateTextResult<TOOLS, OUTPUT>['toolResults'];
  readonly finishReason: GenerateTextResult<TOOLS, OUTPUT>['finishReason'];
  readonly usage: GenerateTextResult<TOOLS, OUTPUT>['usage'];
  readonly warnings: GenerateTextResult<TOOLS, OUTPUT>['warnings'];
  readonly steps: GenerateTextResult<TOOLS, OUTPUT>['steps'];
  readonly logprobs: GenerateTextResult<TOOLS, OUTPUT>['logprobs'];
  readonly experimental_providerMetadata: GenerateTextResult<
    TOOLS,
    OUTPUT
  >['experimental_providerMetadata'];
  readonly response: GenerateTextResult<TOOLS, OUTPUT>['response'];
  readonly request: GenerateTextResult<TOOLS, OUTPUT>['request'];
  readonly experimental_output: GenerateTextResult<
    TOOLS,
    OUTPUT
  >['experimental_output'];

  constructor(options: {
    text: GenerateTextResult<TOOLS, OUTPUT>['text'];
    toolCalls: GenerateTextResult<TOOLS, OUTPUT>['toolCalls'];
    toolResults: GenerateTextResult<TOOLS, OUTPUT>['toolResults'];
    finishReason: GenerateTextResult<TOOLS, OUTPUT>['finishReason'];
    usage: GenerateTextResult<TOOLS, OUTPUT>['usage'];
    warnings: GenerateTextResult<TOOLS, OUTPUT>['warnings'];
    logprobs: GenerateTextResult<TOOLS, OUTPUT>['logprobs'];
    steps: GenerateTextResult<TOOLS, OUTPUT>['steps'];
    providerMetadata: GenerateTextResult<
      TOOLS,
      OUTPUT
    >['experimental_providerMetadata'];
    response: GenerateTextResult<TOOLS, OUTPUT>['response'];
    request: GenerateTextResult<TOOLS, OUTPUT>['request'];
    output: GenerateTextResult<TOOLS, OUTPUT>['experimental_output'];
  }) {
    this.text = options.text;
    this.toolCalls = options.toolCalls;
    this.toolResults = options.toolResults;
    this.finishReason = options.finishReason;
    this.usage = options.usage;
    this.warnings = options.warnings;
    this.request = options.request;
    this.response = options.response;
    this.steps = options.steps;
    this.experimental_providerMetadata = options.providerMetadata;
    this.logprobs = options.logprobs;
    this.experimental_output = options.output;
  }
}
