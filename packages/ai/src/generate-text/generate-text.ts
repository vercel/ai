import {
  LanguageModelV2,
  LanguageModelV2Content,
  LanguageModelV2ToolCall,
} from '@ai-sdk/provider';
import {
  createIdGenerator,
  getErrorMessage,
  IdGenerator,
  ProviderOptions,
} from '@ai-sdk/provider-utils';
import { Tracer } from '@opentelemetry/api';
import { NoOutputSpecifiedError } from '../error/no-output-specified-error';
import { resolveLanguageModel } from '../model/resolve-model';
import { ModelMessage } from '../prompt';
import { CallSettings } from '../prompt/call-settings';
import { convertToLanguageModelPrompt } from '../prompt/convert-to-language-model-prompt';
import { prepareCallSettings } from '../prompt/prepare-call-settings';
import { prepareToolsAndToolChoice } from '../prompt/prepare-tools-and-tool-choice';
import { Prompt } from '../prompt/prompt';
import { standardizePrompt } from '../prompt/standardize-prompt';
import { wrapGatewayError } from '../prompt/wrap-gateway-error';
import { assembleOperationName } from '../telemetry/assemble-operation-name';
import { getBaseTelemetryAttributes } from '../telemetry/get-base-telemetry-attributes';
import { getTracer } from '../telemetry/get-tracer';
import { recordErrorOnSpan, recordSpan } from '../telemetry/record-span';
import { selectTelemetryAttributes } from '../telemetry/select-telemetry-attributes';
import { stringifyForTelemetry } from '../telemetry/stringify-for-telemetry';
import { TelemetrySettings } from '../telemetry/telemetry-settings';
import { LanguageModel, ToolChoice } from '../types';
import { addLanguageModelUsage, LanguageModelUsage } from '../types/usage';
import { asArray } from '../util/as-array';
import { prepareRetries } from '../util/prepare-retries';
import { ContentPart } from './content-part';
import { extractContentText } from './extract-content-text';
import { GenerateTextResult } from './generate-text-result';
import { DefaultGeneratedFile } from './generated-file';
import { Output } from './output';
import { parseToolCall } from './parse-tool-call';
import { PrepareStepFunction } from './prepare-step';
import { ResponseMessage } from './response-message';
import { DefaultStepResult, StepResult } from './step-result';
import {
  isStopConditionMet,
  stepCountIs,
  StopCondition,
} from './stop-condition';
import { toResponseMessages } from './to-response-messages';
import { TypedToolCall } from './tool-call';
import { ToolCallRepairFunction } from './tool-call-repair-function';
import { TypedToolError } from './tool-error';
import { ToolOutput } from './tool-output';
import { TypedToolResult } from './tool-result';
import { ToolSet } from './tool-set';

const originalGenerateId = createIdGenerator({
  prefix: 'aitxt',
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

@param maxOutputTokens - Maximum number of tokens to generate.
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
  model: modelArg,
  tools,
  toolChoice,
  system,
  prompt,
  messages,
  maxRetries: maxRetriesArg,
  abortSignal,
  headers,
  stopWhen = stepCountIs(1),
  experimental_output: output,
  experimental_telemetry: telemetry,
  providerOptions,
  experimental_activeTools,
  activeTools = experimental_activeTools,
  experimental_prepareStep,
  prepareStep = experimental_prepareStep,
  experimental_repairToolCall: repairToolCall,
  experimental_context,
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
    toolChoice?: ToolChoice<NoInfer<TOOLS>>;

    /**
Condition for stopping the generation when there are tool results in the last step.
When the condition is an array, any of the conditions can be met to stop the generation.

@default stepCountIs(1)
     */
    stopWhen?:
      | StopCondition<NoInfer<TOOLS>>
      | Array<StopCondition<NoInfer<TOOLS>>>;

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
     * @deprecated Use `activeTools` instead.
     */
    experimental_activeTools?: Array<keyof NoInfer<TOOLS>>;

    /**
Limits the tools that are available for the model to call without
changing the tool call and result types in the result.
     */
    activeTools?: Array<keyof NoInfer<TOOLS>>;

    /**
Optional specification for parsing structured outputs from the LLM response.
     */
    experimental_output?: Output<OUTPUT, OUTPUT_PARTIAL>;

    /**
     * @deprecated Use `prepareStep` instead.
     */
    experimental_prepareStep?: PrepareStepFunction<NoInfer<TOOLS>>;

    /**
Optional function that you can use to provide different settings for a step.
    */
    prepareStep?: PrepareStepFunction<NoInfer<TOOLS>>;

    /**
A function that attempts to repair a tool call that failed to parse.
     */
    experimental_repairToolCall?: ToolCallRepairFunction<NoInfer<TOOLS>>;

    /**
    Callback that is called when each step (LLM call) is finished, including intermediate steps.
    */
    onStepFinish?: GenerateTextOnStepFinishCallback<NoInfer<TOOLS>>;

    /**
     * Context that is passed into tool execution.
     *
     * Experimental (can break in patch releases).
     *
     * @default undefined
     */
    experimental_context?: unknown;

    /**
     * Internal. For test use only. May change without notice.
     */
    _internal?: {
      generateId?: IdGenerator;
      currentDate?: () => Date;
    };
  }): Promise<GenerateTextResult<TOOLS, OUTPUT>> {
  const model = resolveLanguageModel(modelArg);
  const stopConditions = asArray(stopWhen);
  const { maxRetries, retry } = prepareRetries({
    maxRetries: maxRetriesArg,
    abortSignal,
  });

  const callSettings = prepareCallSettings(settings);

  const baseTelemetryAttributes = getBaseTelemetryAttributes({
    model,
    telemetry,
    headers,
    settings: { ...callSettings, maxRetries },
  });

  const initialPrompt = await standardizePrompt({
    system,
    prompt,
    messages,
  });

  const tracer = getTracer(telemetry);

  try {
    return await recordSpan({
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
        },
      }),
      tracer,
      fn: async span => {
        const callSettings = prepareCallSettings(settings);

        let currentModelResponse: Awaited<
          ReturnType<LanguageModelV2['doGenerate']>
        > & { response: { id: string; timestamp: Date; modelId: string } };
        let clientToolCalls: Array<TypedToolCall<TOOLS>> = [];
        let clientToolOutputs: Array<ToolOutput<TOOLS>> = [];
        const responseMessages: Array<ResponseMessage> = [];
        const steps: GenerateTextResult<TOOLS, OUTPUT>['steps'] = [];

        do {
          const stepInputMessages = [
            ...initialPrompt.messages,
            ...responseMessages,
          ];

          const prepareStepResult = await prepareStep?.({
            model,
            steps,
            stepNumber: steps.length,
            messages: stepInputMessages,
          });

          const promptMessages = await convertToLanguageModelPrompt({
            prompt: {
              system: prepareStepResult?.system ?? initialPrompt.system,
              messages: prepareStepResult?.messages ?? stepInputMessages,
            },
            supportedUrls: await model.supportedUrls,
          });

          const stepModel = resolveLanguageModel(
            prepareStepResult?.model ?? model,
          );

          const { toolChoice: stepToolChoice, tools: stepTools } =
            prepareToolsAndToolChoice({
              tools,
              toolChoice: prepareStepResult?.toolChoice ?? toolChoice,
              activeTools: prepareStepResult?.activeTools ?? activeTools,
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
                  // model:
                  'ai.model.provider': stepModel.provider,
                  'ai.model.id': stepModel.modelId,
                  // prompt:
                  'ai.prompt.messages': {
                    input: () => stringifyForTelemetry(promptMessages),
                  },
                  'ai.prompt.tools': {
                    // convert the language model level tools:
                    input: () => stepTools?.map(tool => JSON.stringify(tool)),
                  },
                  'ai.prompt.toolChoice': {
                    input: () =>
                      stepToolChoice != null
                        ? JSON.stringify(stepToolChoice)
                        : undefined,
                  },

                  // standardized gen-ai llm span attributes:
                  'gen_ai.system': stepModel.provider,
                  'gen_ai.request.model': stepModel.modelId,
                  'gen_ai.request.frequency_penalty': settings.frequencyPenalty,
                  'gen_ai.request.max_tokens': settings.maxOutputTokens,
                  'gen_ai.request.presence_penalty': settings.presencePenalty,
                  'gen_ai.request.stop_sequences': settings.stopSequences,
                  'gen_ai.request.temperature':
                    settings.temperature ?? undefined,
                  'gen_ai.request.top_k': settings.topK,
                  'gen_ai.request.top_p': settings.topP,
                },
              }),
              tracer,
              fn: async span => {
                const result = await stepModel.doGenerate({
                  ...callSettings,
                  tools: stepTools,
                  toolChoice: stepToolChoice,
                  responseFormat: output?.responseFormat,
                  prompt: promptMessages,
                  providerOptions,
                  abortSignal,
                  headers,
                });

                // Fill in default values:
                const responseData = {
                  id: result.response?.id ?? generateId(),
                  timestamp: result.response?.timestamp ?? currentDate(),
                  modelId: result.response?.modelId ?? stepModel.modelId,
                  headers: result.response?.headers,
                  body: result.response?.body,
                };

                // Add response information to the span:
                span.setAttributes(
                  selectTelemetryAttributes({
                    telemetry,
                    attributes: {
                      'ai.response.finishReason': result.finishReason,
                      'ai.response.text': {
                        output: () => extractContentText(result.content),
                      },
                      'ai.response.toolCalls': {
                        output: () => {
                          const toolCalls = asToolCalls(result.content);
                          return toolCalls == null
                            ? undefined
                            : JSON.stringify(toolCalls);
                        },
                      },
                      'ai.response.id': responseData.id,
                      'ai.response.model': responseData.modelId,
                      'ai.response.timestamp':
                        responseData.timestamp.toISOString(),
                      'ai.response.providerMetadata': JSON.stringify(
                        result.providerMetadata,
                      ),

                      // TODO rename telemetry attributes to inputTokens and outputTokens
                      'ai.usage.promptTokens': result.usage.inputTokens,
                      'ai.usage.completionTokens': result.usage.outputTokens,

                      // standardized gen-ai llm span attributes:
                      'gen_ai.response.finish_reasons': [result.finishReason],
                      'gen_ai.response.id': responseData.id,
                      'gen_ai.response.model': responseData.modelId,
                      'gen_ai.usage.input_tokens': result.usage.inputTokens,
                      'gen_ai.usage.output_tokens': result.usage.outputTokens,
                    },
                  }),
                );

                return { ...result, response: responseData };
              },
            }),
          );

          // parse tool calls:
          const stepToolCalls: TypedToolCall<TOOLS>[] = await Promise.all(
            currentModelResponse.content
              .filter(
                (part): part is LanguageModelV2ToolCall =>
                  part.type === 'tool-call',
              )
              .map(toolCall =>
                parseToolCall({
                  toolCall,
                  tools,
                  repairToolCall,
                  system,
                  messages: stepInputMessages,
                }),
              ),
          );

          // notify the tools that the tool calls are available:
          for (const toolCall of stepToolCalls) {
            if (toolCall.invalid) {
              continue; // ignore invalid tool calls
            }

            const tool = tools![toolCall.toolName];
            if (tool?.onInputAvailable != null) {
              await tool.onInputAvailable({
                input: toolCall.input,
                toolCallId: toolCall.toolCallId,
                messages: stepInputMessages,
                abortSignal,
                experimental_context,
              });
            }
          }

          // insert error tool outputs for invalid tool calls:
          // TODO AI SDK 6: invalid inputs should not require output parts
          const invalidToolCalls = stepToolCalls.filter(
            toolCall => toolCall.invalid && toolCall.dynamic,
          );

          clientToolOutputs = [];

          for (const toolCall of invalidToolCalls) {
            clientToolOutputs.push({
              type: 'tool-error',
              toolCallId: toolCall.toolCallId,
              toolName: toolCall.toolName,
              input: toolCall.input,
              error: getErrorMessage(toolCall.error!),
              dynamic: true,
            });
          }

          // execute client tool calls:
          clientToolCalls = stepToolCalls.filter(
            toolCall => !toolCall.providerExecuted,
          );

          if (tools != null) {
            clientToolOutputs.push(
              ...(await executeTools({
                toolCalls: clientToolCalls.filter(
                  toolCall => !toolCall.invalid,
                ),
                tools,
                tracer,
                telemetry,
                messages: stepInputMessages,
                abortSignal,
                experimental_context,
              })),
            );
          }

          // content:
          const stepContent = asContent({
            content: currentModelResponse.content,
            toolCalls: stepToolCalls,
            toolOutputs: clientToolOutputs,
          });

          // append to messages for potential next step:
          responseMessages.push(
            ...toResponseMessages({
              content: stepContent,
              tools,
            }),
          );

          // Add step information (after response messages are updated):
          const currentStepResult: StepResult<TOOLS> = new DefaultStepResult({
            content: stepContent,
            finishReason: currentModelResponse.finishReason,
            usage: currentModelResponse.usage,
            warnings: currentModelResponse.warnings,
            providerMetadata: currentModelResponse.providerMetadata,
            request: currentModelResponse.request ?? {},
            response: {
              ...currentModelResponse.response,
              // deep clone msgs to avoid mutating past messages in multi-step:
              messages: structuredClone(responseMessages),
            },
          });

          steps.push(currentStepResult);
          await onStepFinish?.(currentStepResult);
        } while (
          // there are tool calls:
          clientToolCalls.length > 0 &&
          // all current tool calls have outputs (incl. execution errors):
          clientToolOutputs.length === clientToolCalls.length &&
          // continue until a stop condition is met:
          !(await isStopConditionMet({ stopConditions, steps }))
        );

        // Add response information to the span:
        span.setAttributes(
          selectTelemetryAttributes({
            telemetry,
            attributes: {
              'ai.response.finishReason': currentModelResponse.finishReason,
              'ai.response.text': {
                output: () => extractContentText(currentModelResponse.content),
              },
              'ai.response.toolCalls': {
                output: () => {
                  const toolCalls = asToolCalls(currentModelResponse.content);
                  return toolCalls == null
                    ? undefined
                    : JSON.stringify(toolCalls);
                },
              },
              'ai.response.providerMetadata': JSON.stringify(
                currentModelResponse.providerMetadata,
              ),

              // TODO rename telemetry attributes to inputTokens and outputTokens
              'ai.usage.promptTokens': currentModelResponse.usage.inputTokens,
              'ai.usage.completionTokens':
                currentModelResponse.usage.outputTokens,
            },
          }),
        );

        const lastStep = steps[steps.length - 1];

        return new DefaultGenerateTextResult({
          steps,
          resolvedOutput: await output?.parseOutput(
            { text: lastStep.text },
            {
              response: lastStep.response,
              usage: lastStep.usage,
              finishReason: lastStep.finishReason,
            },
          ),
        });
      },
    });
  } catch (error) {
    throw wrapGatewayError(error);
  }
}

async function executeTools<TOOLS extends ToolSet>({
  toolCalls,
  tools,
  tracer,
  telemetry,
  messages,
  abortSignal,
  experimental_context,
}: {
  toolCalls: Array<TypedToolCall<TOOLS>>;
  tools: TOOLS;
  tracer: Tracer;
  telemetry: TelemetrySettings | undefined;
  messages: ModelMessage[];
  abortSignal: AbortSignal | undefined;
  experimental_context: unknown;
}): Promise<Array<ToolOutput<TOOLS>>> {
  const toolOutputs = await Promise.all(
    toolCalls.map(async ({ toolCallId, toolName, input }) => {
      const tool = tools[toolName];

      if (tool?.execute == null) {
        return undefined;
      }

      return recordSpan({
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
              output: () => JSON.stringify(input),
            },
          },
        }),
        tracer,
        fn: async span => {
          try {
            const output = await tool.execute!(input, {
              toolCallId,
              messages,
              abortSignal,
              experimental_context,
            });

            try {
              span.setAttributes(
                selectTelemetryAttributes({
                  telemetry,
                  attributes: {
                    'ai.toolCall.result': {
                      output: () => JSON.stringify(output),
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

            return {
              type: 'tool-result',
              toolCallId,
              toolName,
              input,
              output,
              dynamic: tool.type === 'dynamic',
            } as TypedToolResult<TOOLS>;
          } catch (error) {
            recordErrorOnSpan(span, error);
            return {
              type: 'tool-error',
              toolCallId,
              toolName,
              input,
              error,
              dynamic: tool.type === 'dynamic',
            } as TypedToolError<TOOLS>;
          }
        },
      });
    }),
  );

  return toolOutputs.filter(
    (output): output is NonNullable<typeof output> => output != null,
  );
}

class DefaultGenerateTextResult<TOOLS extends ToolSet, OUTPUT>
  implements GenerateTextResult<TOOLS, OUTPUT>
{
  readonly steps: GenerateTextResult<TOOLS, OUTPUT>['steps'];

  private readonly resolvedOutput: OUTPUT;

  constructor(options: {
    steps: GenerateTextResult<TOOLS, OUTPUT>['steps'];
    resolvedOutput: OUTPUT;
  }) {
    this.steps = options.steps;
    this.resolvedOutput = options.resolvedOutput;
  }

  private get finalStep() {
    return this.steps[this.steps.length - 1];
  }

  get content() {
    return this.finalStep.content;
  }

  get text() {
    return this.finalStep.text;
  }

  get files() {
    return this.finalStep.files;
  }

  get reasoningText() {
    return this.finalStep.reasoningText;
  }

  get reasoning() {
    return this.finalStep.reasoning;
  }

  get toolCalls() {
    return this.finalStep.toolCalls;
  }

  get staticToolCalls() {
    return this.finalStep.staticToolCalls;
  }

  get dynamicToolCalls() {
    return this.finalStep.dynamicToolCalls;
  }

  get toolResults() {
    return this.finalStep.toolResults;
  }

  get staticToolResults() {
    return this.finalStep.staticToolResults;
  }

  get dynamicToolResults() {
    return this.finalStep.dynamicToolResults;
  }

  get sources() {
    return this.finalStep.sources;
  }

  get finishReason() {
    return this.finalStep.finishReason;
  }

  get warnings() {
    return this.finalStep.warnings;
  }

  get providerMetadata() {
    return this.finalStep.providerMetadata;
  }

  get response() {
    return this.finalStep.response;
  }

  get request() {
    return this.finalStep.request;
  }

  get usage() {
    return this.finalStep.usage;
  }

  get totalUsage() {
    return this.steps.reduce(
      (totalUsage, step) => {
        return addLanguageModelUsage(totalUsage, step.usage);
      },
      {
        inputTokens: undefined,
        outputTokens: undefined,
        totalTokens: undefined,
        reasoningTokens: undefined,
        cachedInputTokens: undefined,
      } as LanguageModelUsage,
    );
  }

  get experimental_output() {
    if (this.resolvedOutput == null) {
      throw new NoOutputSpecifiedError();
    }

    return this.resolvedOutput;
  }
}

function asToolCalls(content: Array<LanguageModelV2Content>) {
  const parts = content.filter(
    (part): part is LanguageModelV2ToolCall => part.type === 'tool-call',
  );

  if (parts.length === 0) {
    return undefined;
  }

  return parts.map(toolCall => ({
    toolCallId: toolCall.toolCallId,
    toolName: toolCall.toolName,
    input: toolCall.input,
  }));
}

function asContent<TOOLS extends ToolSet>({
  content,
  toolCalls,
  toolOutputs,
}: {
  content: Array<LanguageModelV2Content>;
  toolCalls: Array<TypedToolCall<TOOLS>>;
  toolOutputs: Array<ToolOutput<TOOLS>>;
}): Array<ContentPart<TOOLS>> {
  return [
    ...content.map(part => {
      switch (part.type) {
        case 'text':
        case 'reasoning':
        case 'source':
          return part;

        case 'file': {
          return {
            type: 'file' as const,
            file: new DefaultGeneratedFile(part),
          };
        }

        case 'tool-call': {
          return toolCalls.find(
            toolCall => toolCall.toolCallId === part.toolCallId,
          )!;
        }

        case 'tool-result': {
          const toolCall = toolCalls.find(
            toolCall => toolCall.toolCallId === part.toolCallId,
          )!;

          if (toolCall == null) {
            throw new Error(`Tool call ${part.toolCallId} not found.`);
          }

          if (part.isError) {
            return {
              type: 'tool-error' as const,
              toolCallId: part.toolCallId,
              toolName: part.toolName as keyof TOOLS & string,
              input: toolCall.input,
              error: part.result,
              providerExecuted: true,
              dynamic: toolCall.dynamic,
            } as TypedToolError<TOOLS>;
          }

          return {
            type: 'tool-result' as const,
            toolCallId: part.toolCallId,
            toolName: part.toolName as keyof TOOLS & string,
            input: toolCall.input,
            output: part.result,
            providerExecuted: true,
            dynamic: toolCall.dynamic,
          } as TypedToolResult<TOOLS>;
        }
      }
    }),
    ...toolOutputs,
  ];
}
