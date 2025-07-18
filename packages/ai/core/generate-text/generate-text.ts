import { createIdGenerator, IDGenerator } from '@ai-sdk/provider-utils';
import { Tracer } from '@opentelemetry/api';
import { InvalidArgumentError } from '../../errors/invalid-argument-error';
import { NoOutputSpecifiedError } from '../../errors/no-output-specified-error';
import { ToolExecutionError } from '../../errors/tool-execution-error';
import { UnsupportedModelVersionError } from '../../errors/unsupported-model-version-error';
import { CoreAssistantMessage, CoreMessage } from '../prompt';
import { CallSettings } from '../prompt/call-settings';
import { convertToLanguageModelPrompt } from '../prompt/convert-to-language-model-prompt';
import { prepareCallSettings } from '../prompt/prepare-call-settings';
import { prepareRetries } from '../prompt/prepare-retries';
import { prepareToolsAndToolChoice } from '../prompt/prepare-tools-and-tool-choice';
import { Prompt } from '../prompt/prompt';
import { standardizePrompt } from '../prompt/standardize-prompt';
import { stringifyForTelemetry } from '../prompt/stringify-for-telemetry';
import { assembleOperationName } from '../telemetry/assemble-operation-name';
import { getBaseTelemetryAttributes } from '../telemetry/get-base-telemetry-attributes';
import { getTracer } from '../telemetry/get-tracer';
import { recordErrorOnSpan, recordSpan } from '../telemetry/record-span';
import { selectTelemetryAttributes } from '../telemetry/select-telemetry-attributes';
import { TelemetrySettings } from '../telemetry/telemetry-settings';
import { LanguageModel, ToolChoice } from '../types';
import { ProviderMetadata, ProviderOptions } from '../types/provider-metadata';
import {
  addLanguageModelUsage,
  calculateLanguageModelUsage,
  LanguageModelUsage,
} from '../types/usage';
import { removeTextAfterLastWhitespace } from '../util/remove-text-after-last-whitespace';
import { GenerateTextResult } from './generate-text-result';
import { DefaultGeneratedFile, GeneratedFile } from './generated-file';
import { Output } from './output';
import { parseToolCall } from './parse-tool-call';
import { PrepareStepFunction } from './prepare-step';
import { asReasoningText, ReasoningDetail } from './reasoning-detail';
import { ResponseMessage, StepResult } from './step-result';
import { toResponseMessages } from './to-response-messages';
import { ToolCallArray } from './tool-call';
import { ToolCallRepairFunction } from './tool-call-repair';
import { ToolResultArray } from './tool-result';
import { ToolSet } from './tool-set';

const originalGenerateId = createIdGenerator({
  prefix: 'aitxt',
  size: 24,
});

const originalGenerateMessageId = createIdGenerator({
  prefix: 'msg',
  size: 24,
});

/**
Callback that is set using the `onStepFinish` option.

@param stepResult - The result of the step.
 */
export type GenerateTextOnStepFinishCallback<TOOLS extends ToolSet> = (
  stepResult: StepResult<TOOLS>,
) => Promise<void> | void;

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
@param experimental_generateMessageId - Generate a unique ID for each message.

@param onStepFinish - Callback that is called when each step (LLM call) is finished, including intermediate steps.

@returns
A result object that contains the generated text, the results of the tool calls, and additional information.
 */
export async function generateText<
  TOOLS extends ToolSet,
  OUTPUT = never,
  OUTPUT_PARTIAL = never,
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
  experimental_generateMessageId: generateMessageId = originalGenerateMessageId,
  experimental_output: output,
  experimental_continueSteps: continueSteps = false,
  experimental_telemetry: telemetry,
  experimental_providerMetadata,
  providerOptions = experimental_providerMetadata,
  experimental_activeTools: activeTools,
  experimental_prepareStep: prepareStep,
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
    toolChoice?: ToolChoice<TOOLS>;

    /**
Maximum number of sequential LLM calls (steps), e.g. when you use tool calls. Must be at least 1.

A maximum number is required to prevent infinite loops in the case of misconfigured tools.

By default, it's set to 1, which means that only a single LLM call is made.
     */
    maxSteps?: number;

    /**
Generate a unique ID for each message.
     */
    experimental_generateMessageId?: IDGenerator;

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
Additional provider-specific options. They are passed through
to the provider from the AI SDK and enable provider-specific
functionality that can be fully encapsulated in the provider.
 */
    providerOptions?: ProviderOptions;

    /**
@deprecated Use `providerOptions` instead.
     */
    experimental_providerMetadata?: ProviderMetadata;

    /**
Limits the tools that are available for the model to call without
changing the tool call and result types in the result.
     */
    experimental_activeTools?: Array<keyof TOOLS>;

    /**
Optional specification for parsing structured outputs from the LLM response.
     */
    experimental_output?: Output<OUTPUT, OUTPUT_PARTIAL>;

    /**
Optional function that you can use to provide different settings for a step.

@param options - The options for the step.
@param options.steps - The steps that have been executed so far.
@param options.stepNumber - The number of the step that is being executed.
@param options.maxSteps - The maximum number of steps.
@param options.model - The model that is being used.

@returns An object that contains the settings for the step.
If you return undefined (or for undefined settings), the settings from the outer level will be used.
    */
    experimental_prepareStep?: PrepareStepFunction<TOOLS>;

    /**
A function that attempts to repair a tool call that failed to parse.
     */
    experimental_repairToolCall?: ToolCallRepairFunction<TOOLS>;

    /**
    Callback that is called when each step (LLM call) is finished, including intermediate steps.
    */
    onStepFinish?: GenerateTextOnStepFinishCallback<TOOLS>;

    /**
     * Internal. For test use only. May change without notice.
     */
    _internal?: {
      generateId?: IDGenerator;
      currentDate?: () => Date;
    };
  }): Promise<GenerateTextResult<TOOLS, OUTPUT>> {
  if (typeof model === 'string' || model.specificationVersion !== 'v1') {
    throw new UnsupportedModelVersionError();
  }

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
        // model:
        'ai.model.provider': model.provider,
        'ai.model.id': model.modelId,
        // specific settings that only make sense on the outer level:
        'ai.prompt': {
          input: () => JSON.stringify({ system, prompt, messages }),
        },
        'ai.settings.maxSteps': maxSteps,
      },
    }),
    tracer,
    fn: async span => {
      const callSettings = prepareCallSettings(settings);

      let currentModelResponse: Awaited<
        ReturnType<LanguageModel['doGenerate']>
      > & { response: { id: string; timestamp: Date; modelId: string } };
      let currentToolCalls: ToolCallArray<TOOLS> = [];
      let currentToolResults: ToolResultArray<TOOLS> = [];
      let currentReasoningDetails: Array<ReasoningDetail> = [];
      let stepCount = 0;
      const responseMessages: Array<ResponseMessage> = [];
      let text = '';
      const sources: GenerateTextResult<TOOLS, OUTPUT>['sources'] = [];
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
          modelSupportsUrl: model.supportsUrl?.bind(model), // support 'this' context
        });

        const prepareStepResult = await prepareStep?.({
          model,
          steps,
          stepNumber: stepCount,
          messages: promptMessages,
        });

        const stepToolChoice = prepareStepResult?.toolChoice ?? toolChoice;
        const stepActiveTools =
          prepareStepResult?.experimental_activeTools ?? activeTools;
        const stepModel = prepareStepResult?.model ?? model;

        const promptMessagesForStep = await convertToLanguageModelPrompt({
          prompt: {
            type: promptFormat,
            system: initialPrompt.system,
            messages: stepInputMessages,
          },
          modelSupportsImageUrls: stepModel.supportsImageUrls,
          modelSupportsUrl: stepModel.supportsUrl?.bind(stepModel), // support 'this' context
        });

        const mode = {
          type: 'regular' as const,
          ...prepareToolsAndToolChoice({
            tools,
            toolChoice: stepToolChoice,
            activeTools: stepActiveTools,
          }),
        };

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
                // model:
                'ai.model.provider': stepModel.provider,
                'ai.model.id': stepModel.modelId,
                // prompt:
                'ai.prompt.format': { input: () => promptFormat },
                'ai.prompt.messages': {
                  input: () => stringifyForTelemetry(promptMessagesForStep),
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
                'gen_ai.system': stepModel.provider,
                'gen_ai.request.model': stepModel.modelId,
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
              const result = await stepModel.doGenerate({
                mode,
                ...callSettings,
                inputFormat: promptFormat,
                responseFormat: output?.responseFormat({ model }),
                prompt: promptMessagesForStep,
                providerMetadata: providerOptions,
                abortSignal,
                headers,
              });

              // Fill in default values:
              const responseData = {
                id: result.response?.id ?? generateId(),
                timestamp: result.response?.timestamp ?? currentDate(),
                modelId: result.response?.modelId ?? stepModel.modelId,
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
                    'ai.response.providerMetadata': JSON.stringify(
                      result.providerMetadata,
                    ),

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

        currentReasoningDetails = asReasoningDetails(
          currentModelResponse.reasoning,
        );

        // sources:
        sources.push(...(currentModelResponse.sources ?? []));

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
              files: asFiles(currentModelResponse.files),
              reasoning: asReasoningDetails(currentModelResponse.reasoning),
              tools: tools ?? ({} as TOOLS),
              toolCalls: currentToolCalls,
              toolResults: currentToolResults,
              messageId: generateMessageId(),
              generateMessageId,
            }),
          );
        }

        // Add step information (after response messages are updated):
        const currentStepResult: StepResult<TOOLS> = {
          stepType,
          text: stepText,
          // TODO v5: rename reasoning to reasoningText (and use reasoning for composite array)
          reasoning: asReasoningText(currentReasoningDetails),
          reasoningDetails: currentReasoningDetails,
          files: asFiles(currentModelResponse.files),
          sources: currentModelResponse.sources ?? [],
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
            body: currentModelResponse.rawResponse?.body,

            // deep clone msgs to avoid mutating past messages in multi-step:
            messages: structuredClone(responseMessages),
          },
          providerMetadata: currentModelResponse.providerMetadata,
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
            'ai.response.providerMetadata': JSON.stringify(
              currentModelResponse.providerMetadata,
            ),
          },
        }),
      );

      return new DefaultGenerateTextResult({
        text,
        files: asFiles(currentModelResponse.files),
        reasoning: asReasoningText(currentReasoningDetails),
        reasoningDetails: currentReasoningDetails,
        sources,
        outputResolver: () => {
          if (output == null) {
            throw new NoOutputSpecifiedError();
          }

          return output.parseOutput(
            { text },
            {
              response: currentModelResponse.response,
              usage,
              finishReason: currentModelResponse.finishReason,
            },
          );
        },
        toolCalls: currentToolCalls,
        toolResults: currentToolResults,
        finishReason: currentModelResponse.finishReason,
        usage,
        warnings: currentModelResponse.warnings,
        request: currentModelResponse.request ?? {},
        response: {
          ...currentModelResponse.response,
          headers: currentModelResponse.rawResponse?.headers,
          body: currentModelResponse.rawResponse?.body,
          messages: responseMessages,
        },
        logprobs: currentModelResponse.logprobs,
        steps,
        providerMetadata: currentModelResponse.providerMetadata,
      });
    },
  });
}

async function executeTools<TOOLS extends ToolSet>({
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
            recordErrorOnSpan(span, error);
            throw new ToolExecutionError({
              toolCallId,
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

class DefaultGenerateTextResult<TOOLS extends ToolSet, OUTPUT>
  implements GenerateTextResult<TOOLS, OUTPUT>
{
  readonly text: GenerateTextResult<TOOLS, OUTPUT>['text'];
  readonly files: GenerateTextResult<TOOLS, OUTPUT>['files'];
  readonly reasoning: GenerateTextResult<TOOLS, OUTPUT>['reasoning'];
  readonly reasoningDetails: GenerateTextResult<
    TOOLS,
    OUTPUT
  >['reasoningDetails'];
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
  readonly providerMetadata: GenerateTextResult<
    TOOLS,
    OUTPUT
  >['providerMetadata'];
  readonly response: GenerateTextResult<TOOLS, OUTPUT>['response'];
  readonly request: GenerateTextResult<TOOLS, OUTPUT>['request'];
  readonly sources: GenerateTextResult<TOOLS, OUTPUT>['sources'];

  private readonly outputResolver: () => GenerateTextResult<
    TOOLS,
    OUTPUT
  >['experimental_output'];

  constructor(options: {
    text: GenerateTextResult<TOOLS, OUTPUT>['text'];
    files: GenerateTextResult<TOOLS, OUTPUT>['files'];
    reasoning: GenerateTextResult<TOOLS, OUTPUT>['reasoning'];
    reasoningDetails: GenerateTextResult<TOOLS, OUTPUT>['reasoningDetails'];
    toolCalls: GenerateTextResult<TOOLS, OUTPUT>['toolCalls'];
    toolResults: GenerateTextResult<TOOLS, OUTPUT>['toolResults'];
    finishReason: GenerateTextResult<TOOLS, OUTPUT>['finishReason'];
    usage: GenerateTextResult<TOOLS, OUTPUT>['usage'];
    warnings: GenerateTextResult<TOOLS, OUTPUT>['warnings'];
    logprobs: GenerateTextResult<TOOLS, OUTPUT>['logprobs'];
    steps: GenerateTextResult<TOOLS, OUTPUT>['steps'];
    providerMetadata: GenerateTextResult<TOOLS, OUTPUT>['providerMetadata'];
    response: GenerateTextResult<TOOLS, OUTPUT>['response'];
    request: GenerateTextResult<TOOLS, OUTPUT>['request'];
    outputResolver: () => GenerateTextResult<
      TOOLS,
      OUTPUT
    >['experimental_output'];
    sources: GenerateTextResult<TOOLS, OUTPUT>['sources'];
  }) {
    this.text = options.text;
    this.files = options.files;
    this.reasoning = options.reasoning;
    this.reasoningDetails = options.reasoningDetails;
    this.toolCalls = options.toolCalls;
    this.toolResults = options.toolResults;
    this.finishReason = options.finishReason;
    this.usage = options.usage;
    this.warnings = options.warnings;
    this.request = options.request;
    this.response = options.response;
    this.steps = options.steps;
    this.experimental_providerMetadata = options.providerMetadata;
    this.providerMetadata = options.providerMetadata;
    this.logprobs = options.logprobs;
    this.outputResolver = options.outputResolver;
    this.sources = options.sources;
  }

  get experimental_output() {
    return this.outputResolver();
  }
}

function asReasoningDetails(
  reasoning:
    | string
    | Array<
        | { type: 'text'; text: string; signature?: string }
        | { type: 'redacted'; data: string }
      >
    | undefined,
): Array<
  | { type: 'text'; text: string; signature?: string }
  | { type: 'redacted'; data: string }
> {
  if (reasoning == null) {
    return [];
  }

  if (typeof reasoning === 'string') {
    return [{ type: 'text', text: reasoning }];
  }

  return reasoning;
}

function asFiles(
  files:
    | Array<{
        data: string | Uint8Array;
        mimeType: string;
      }>
    | undefined,
): Array<GeneratedFile> {
  return files?.map(file => new DefaultGeneratedFile(file)) ?? [];
}
