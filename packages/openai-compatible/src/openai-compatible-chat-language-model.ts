import {
  APICallError,
  InvalidResponseDataError,
  LanguageModelV2,
  LanguageModelV2CallWarning,
  LanguageModelV2FinishReason,
  LanguageModelV2ObjectGenerationMode,
  SharedV2ProviderMetadata,
  LanguageModelV2StreamPart,
} from '@ai-sdk/provider';
import {
  combineHeaders,
  createEventSourceResponseHandler,
  createJsonErrorResponseHandler,
  createJsonResponseHandler,
  FetchFunction,
  generateId,
  isParsableJson,
  ParseResult,
  postJsonToApi,
  ResponseHandler,
} from '@ai-sdk/provider-utils';
import { z } from 'zod';
import { convertToOpenAICompatibleChatMessages } from './convert-to-openai-compatible-chat-messages';
import { getResponseMetadata } from './get-response-metadata';
import { mapOpenAICompatibleFinishReason } from './map-openai-compatible-finish-reason';
import {
  OpenAICompatibleChatModelId,
  OpenAICompatibleChatSettings,
} from './openai-compatible-chat-settings';
import {
  defaultOpenAICompatibleErrorStructure,
  ProviderErrorStructure,
} from './openai-compatible-error';
import { prepareTools } from './openai-compatible-prepare-tools';
import { MetadataExtractor } from './openai-compatible-metadata-extractor';

export type OpenAICompatibleChatConfig = {
  provider: string;
  headers: () => Record<string, string | undefined>;
  url: (options: { modelId: string; path: string }) => string;
  fetch?: FetchFunction;
  errorStructure?: ProviderErrorStructure<any>;
  metadataExtractor?: MetadataExtractor;

  /**
Default object generation mode that should be used with this model when
no mode is specified. Should be the mode with the best results for this
model. `undefined` can be specified if object generation is not supported.
  */
  defaultObjectGenerationMode?: LanguageModelV2ObjectGenerationMode;

  /**
   * Whether the model supports structured outputs.
   */
  supportsStructuredOutputs?: boolean;
};

export class OpenAICompatibleChatLanguageModel implements LanguageModelV2 {
  readonly specificationVersion = 'v2';

  readonly supportsStructuredOutputs: boolean;

  readonly modelId: OpenAICompatibleChatModelId;
  readonly settings: OpenAICompatibleChatSettings;

  private readonly config: OpenAICompatibleChatConfig;
  private readonly failedResponseHandler: ResponseHandler<APICallError>;
  private readonly chunkSchema; // type inferred via constructor

  constructor(
    modelId: OpenAICompatibleChatModelId,
    settings: OpenAICompatibleChatSettings,
    config: OpenAICompatibleChatConfig,
  ) {
    this.modelId = modelId;
    this.settings = settings;
    this.config = config;

    // initialize error handling:
    const errorStructure =
      config.errorStructure ?? defaultOpenAICompatibleErrorStructure;
    this.chunkSchema = createOpenAICompatibleChatChunkSchema(
      errorStructure.errorSchema,
    );
    this.failedResponseHandler = createJsonErrorResponseHandler(errorStructure);

    this.supportsStructuredOutputs = config.supportsStructuredOutputs ?? false;
  }

  get defaultObjectGenerationMode(): 'json' | 'tool' | undefined {
    return this.config.defaultObjectGenerationMode;
  }

  get provider(): string {
    return this.config.provider;
  }

  private get providerOptionsName(): string {
    return this.config.provider.split('.')[0].trim();
  }

  private getArgs({
    prompt,
    maxOutputTokens,
    temperature,
    topP,
    topK,
    frequencyPenalty,
    presencePenalty,
    providerOptions,
    stopSequences,
    responseFormat,
    seed,
    toolChoice,
    tools,
  }: Parameters<LanguageModelV2['doGenerate']>[0]) {
    const warnings: LanguageModelV2CallWarning[] = [];

    if (topK != null) {
      warnings.push({ type: 'unsupported-setting', setting: 'topK' });
    }

    if (
      responseFormat?.type === 'json' &&
      responseFormat.schema != null &&
      !this.supportsStructuredOutputs
    ) {
      warnings.push({
        type: 'unsupported-setting',
        setting: 'responseFormat',
        details:
          'JSON response format schema is only supported with structuredOutputs',
      });
    }

    const {
      tools: openaiTools,
      toolChoice: openaiToolChoice,
      toolWarnings,
    } = prepareTools({
      tools,
      toolChoice,
    });

    return {
      args: {
        // model id:
        model: this.modelId,

        // model specific settings:
        user: this.settings.user,

        // standardized settings:
        max_tokens: maxOutputTokens,
        temperature,
        top_p: topP,
        frequency_penalty: frequencyPenalty,
        presence_penalty: presencePenalty,
        response_format:
          responseFormat?.type === 'json'
            ? this.supportsStructuredOutputs === true &&
              responseFormat.schema != null
              ? {
                  type: 'json_schema',
                  json_schema: {
                    schema: responseFormat.schema,
                    name: responseFormat.name ?? 'response',
                    description: responseFormat.description,
                  },
                }
              : { type: 'json_object' }
            : undefined,

        stop: stopSequences,
        seed,
        ...providerOptions?.[this.providerOptionsName],

        // messages:
        messages: convertToOpenAICompatibleChatMessages(prompt),

        // tools:
        tools: openaiTools,
        tool_choice: openaiToolChoice,
      },
      warnings: [...warnings, ...toolWarnings],
    };
  }

  async doGenerate(
    options: Parameters<LanguageModelV2['doGenerate']>[0],
  ): Promise<Awaited<ReturnType<LanguageModelV2['doGenerate']>>> {
    const { args, warnings } = this.getArgs({ ...options });

    const body = JSON.stringify(args);

    const {
      responseHeaders,
      value: responseBody,
      rawValue: rawResponse,
    } = await postJsonToApi({
      url: this.config.url({
        path: '/chat/completions',
        modelId: this.modelId,
      }),
      headers: combineHeaders(this.config.headers(), options.headers),
      body: args,
      failedResponseHandler: this.failedResponseHandler,
      successfulResponseHandler: createJsonResponseHandler(
        OpenAICompatibleChatResponseSchema,
      ),
      abortSignal: options.abortSignal,
      fetch: this.config.fetch,
    });

    const { messages: rawPrompt, ...rawSettings } = args;
    const choice = responseBody.choices[0];

    // provider metadata:
    const providerMetadata: SharedV2ProviderMetadata = {
      [this.providerOptionsName]: {},
      ...this.config.metadataExtractor?.extractMetadata?.({
        parsedBody: rawResponse,
      }),
    };
    const completionTokenDetails =
      responseBody.usage?.completion_tokens_details;
    const promptTokenDetails = responseBody.usage?.prompt_tokens_details;
    if (completionTokenDetails?.reasoning_tokens != null) {
      providerMetadata[this.providerOptionsName].reasoningTokens =
        completionTokenDetails?.reasoning_tokens;
    }
    if (completionTokenDetails?.accepted_prediction_tokens != null) {
      providerMetadata[this.providerOptionsName].acceptedPredictionTokens =
        completionTokenDetails?.accepted_prediction_tokens;
    }
    if (completionTokenDetails?.rejected_prediction_tokens != null) {
      providerMetadata[this.providerOptionsName].rejectedPredictionTokens =
        completionTokenDetails?.rejected_prediction_tokens;
    }
    if (promptTokenDetails?.cached_tokens != null) {
      providerMetadata[this.providerOptionsName].cachedPromptTokens =
        promptTokenDetails?.cached_tokens;
    }

    return {
      text: choice.message.content ?? undefined,
      reasoning: choice.message.reasoning_content ?? undefined,
      toolCalls: choice.message.tool_calls?.map(toolCall => ({
        toolCallType: 'function',
        toolCallId: toolCall.id ?? generateId(),
        toolName: toolCall.function.name,
        args: toolCall.function.arguments!,
      })),
      finishReason: mapOpenAICompatibleFinishReason(choice.finish_reason),
      usage: {
        inputTokens: responseBody.usage?.prompt_tokens ?? undefined,
        outputTokens: responseBody.usage?.completion_tokens ?? undefined,
      },
      providerMetadata,
      request: { body },
      response: {
        ...getResponseMetadata(responseBody),
        headers: responseHeaders,
        body: rawResponse,
      },
      warnings,
    };
  }

  async doStream(
    options: Parameters<LanguageModelV2['doStream']>[0],
  ): Promise<Awaited<ReturnType<LanguageModelV2['doStream']>>> {
    const { args, warnings } = this.getArgs({ ...options });

    const body = JSON.stringify({ ...args, stream: true });
    const metadataExtractor =
      this.config.metadataExtractor?.createStreamExtractor();

    const { responseHeaders, value: response } = await postJsonToApi({
      url: this.config.url({
        path: '/chat/completions',
        modelId: this.modelId,
      }),
      headers: combineHeaders(this.config.headers(), options.headers),
      body: {
        ...args,
        stream: true,
      },
      failedResponseHandler: this.failedResponseHandler,
      successfulResponseHandler: createEventSourceResponseHandler(
        this.chunkSchema,
      ),
      abortSignal: options.abortSignal,
      fetch: this.config.fetch,
    });

    const toolCalls: Array<{
      id: string;
      type: 'function';
      function: {
        name: string;
        arguments: string;
      };
      hasFinished: boolean;
    }> = [];

    let finishReason: LanguageModelV2FinishReason = 'unknown';
    let usage: {
      completionTokens: number | undefined;
      completionTokensDetails: {
        reasoningTokens: number | undefined;
        acceptedPredictionTokens: number | undefined;
        rejectedPredictionTokens: number | undefined;
      };
      promptTokens: number | undefined;
      promptTokensDetails: {
        cachedTokens: number | undefined;
      };
    } = {
      completionTokens: undefined,
      completionTokensDetails: {
        reasoningTokens: undefined,
        acceptedPredictionTokens: undefined,
        rejectedPredictionTokens: undefined,
      },
      promptTokens: undefined,
      promptTokensDetails: {
        cachedTokens: undefined,
      },
    };
    let isFirstChunk = true;
    let providerOptionsName = this.providerOptionsName;

    return {
      stream: response.pipeThrough(
        new TransformStream<
          ParseResult<z.infer<typeof this.chunkSchema>>,
          LanguageModelV2StreamPart
        >({
          // TODO we lost type safety on Chunk, most likely due to the error schema. MUST FIX
          transform(chunk, controller) {
            // handle failed chunk parsing / validation:
            if (!chunk.success) {
              finishReason = 'error';
              controller.enqueue({ type: 'error', error: chunk.error });
              return;
            }
            const value = chunk.value;

            metadataExtractor?.processChunk(chunk.rawValue);

            // handle error chunks:
            if ('error' in value) {
              finishReason = 'error';
              controller.enqueue({ type: 'error', error: value.error.message });
              return;
            }

            if (isFirstChunk) {
              isFirstChunk = false;

              controller.enqueue({
                type: 'response-metadata',
                ...getResponseMetadata(value),
              });
            }

            if (value.usage != null) {
              const {
                prompt_tokens,
                completion_tokens,
                prompt_tokens_details,
                completion_tokens_details,
              } = value.usage;

              usage.promptTokens = prompt_tokens ?? undefined;
              usage.completionTokens = completion_tokens ?? undefined;

              if (completion_tokens_details?.reasoning_tokens != null) {
                usage.completionTokensDetails.reasoningTokens =
                  completion_tokens_details?.reasoning_tokens;
              }
              if (
                completion_tokens_details?.accepted_prediction_tokens != null
              ) {
                usage.completionTokensDetails.acceptedPredictionTokens =
                  completion_tokens_details?.accepted_prediction_tokens;
              }
              if (
                completion_tokens_details?.rejected_prediction_tokens != null
              ) {
                usage.completionTokensDetails.rejectedPredictionTokens =
                  completion_tokens_details?.rejected_prediction_tokens;
              }
              if (prompt_tokens_details?.cached_tokens != null) {
                usage.promptTokensDetails.cachedTokens =
                  prompt_tokens_details?.cached_tokens;
              }
            }

            const choice = value.choices[0];

            if (choice?.finish_reason != null) {
              finishReason = mapOpenAICompatibleFinishReason(
                choice.finish_reason,
              );
            }

            if (choice?.delta == null) {
              return;
            }

            const delta = choice.delta;

            // enqueue reasoning before text deltas:
            if (delta.reasoning_content != null) {
              controller.enqueue({
                type: 'reasoning',
                textDelta: delta.reasoning_content,
              });
            }

            if (delta.content != null) {
              controller.enqueue({
                type: 'text-delta',
                textDelta: delta.content,
              });
            }

            if (delta.tool_calls != null) {
              for (const toolCallDelta of delta.tool_calls) {
                const index = toolCallDelta.index;

                if (toolCalls[index] == null) {
                  if (toolCallDelta.type !== 'function') {
                    throw new InvalidResponseDataError({
                      data: toolCallDelta,
                      message: `Expected 'function' type.`,
                    });
                  }

                  if (toolCallDelta.id == null) {
                    throw new InvalidResponseDataError({
                      data: toolCallDelta,
                      message: `Expected 'id' to be a string.`,
                    });
                  }

                  if (toolCallDelta.function?.name == null) {
                    throw new InvalidResponseDataError({
                      data: toolCallDelta,
                      message: `Expected 'function.name' to be a string.`,
                    });
                  }

                  toolCalls[index] = {
                    id: toolCallDelta.id,
                    type: 'function',
                    function: {
                      name: toolCallDelta.function.name,
                      arguments: toolCallDelta.function.arguments ?? '',
                    },
                    hasFinished: false,
                  };

                  const toolCall = toolCalls[index];

                  if (
                    toolCall.function?.name != null &&
                    toolCall.function?.arguments != null
                  ) {
                    // send delta if the argument text has already started:
                    if (toolCall.function.arguments.length > 0) {
                      controller.enqueue({
                        type: 'tool-call-delta',
                        toolCallDelta: {
                          toolCallType: 'function',
                          toolCallId: toolCall.id,
                          toolName: toolCall.function.name,
                          argsTextDelta: toolCall.function.arguments,
                        },
                      });
                    }

                    // check if tool call is complete
                    // (some providers send the full tool call in one chunk):
                    if (isParsableJson(toolCall.function.arguments)) {
                      controller.enqueue({
                        type: 'tool-call',
                        toolCall: {
                          toolCallType: 'function',
                          toolCallId: toolCall.id ?? generateId(),
                          toolName: toolCall.function.name,
                          args: toolCall.function.arguments,
                        },
                      });
                      toolCall.hasFinished = true;
                    }
                  }

                  continue;
                }

                // existing tool call, merge if not finished
                const toolCall = toolCalls[index];

                if (toolCall.hasFinished) {
                  continue;
                }

                if (toolCallDelta.function?.arguments != null) {
                  toolCall.function!.arguments +=
                    toolCallDelta.function?.arguments ?? '';
                }

                // send delta
                controller.enqueue({
                  type: 'tool-call-delta',
                  toolCallDelta: {
                    toolCallType: 'function',
                    toolCallId: toolCall.id,
                    toolName: toolCall.function.name,
                    argsTextDelta: toolCallDelta.function.arguments ?? '',
                  },
                });

                // check if tool call is complete
                if (
                  toolCall.function?.name != null &&
                  toolCall.function?.arguments != null &&
                  isParsableJson(toolCall.function.arguments)
                ) {
                  controller.enqueue({
                    type: 'tool-call',
                    toolCall: {
                      toolCallType: 'function',
                      toolCallId: toolCall.id ?? generateId(),
                      toolName: toolCall.function.name,
                      args: toolCall.function.arguments,
                    },
                  });
                  toolCall.hasFinished = true;
                }
              }
            }
          },

          flush(controller) {
            const providerMetadata: SharedV2ProviderMetadata = {
              [providerOptionsName]: {},
              ...metadataExtractor?.buildMetadata(),
            };
            if (usage.completionTokensDetails.reasoningTokens != null) {
              providerMetadata[providerOptionsName].reasoningTokens =
                usage.completionTokensDetails.reasoningTokens;
            }
            if (
              usage.completionTokensDetails.acceptedPredictionTokens != null
            ) {
              providerMetadata[providerOptionsName].acceptedPredictionTokens =
                usage.completionTokensDetails.acceptedPredictionTokens;
            }
            if (
              usage.completionTokensDetails.rejectedPredictionTokens != null
            ) {
              providerMetadata[providerOptionsName].rejectedPredictionTokens =
                usage.completionTokensDetails.rejectedPredictionTokens;
            }
            if (usage.promptTokensDetails.cachedTokens != null) {
              providerMetadata[providerOptionsName].cachedPromptTokens =
                usage.promptTokensDetails.cachedTokens;
            }

            controller.enqueue({
              type: 'finish',
              finishReason,
              usage: {
                inputTokens: usage.promptTokens ?? undefined,
                outputTokens: usage.completionTokens ?? undefined,
              },
              providerMetadata,
            });
          },
        }),
      ),
      request: { body },
      response: { headers: responseHeaders },
      warnings,
    };
  }
}

const openaiCompatibleTokenUsageSchema = z
  .object({
    prompt_tokens: z.number().nullish(),
    completion_tokens: z.number().nullish(),
    prompt_tokens_details: z
      .object({
        cached_tokens: z.number().nullish(),
      })
      .nullish(),
    completion_tokens_details: z
      .object({
        reasoning_tokens: z.number().nullish(),
        accepted_prediction_tokens: z.number().nullish(),
        rejected_prediction_tokens: z.number().nullish(),
      })
      .nullish(),
  })
  .nullish();

// limited version of the schema, focussed on what is needed for the implementation
// this approach limits breakages when the API changes and increases efficiency
const OpenAICompatibleChatResponseSchema = z.object({
  id: z.string().nullish(),
  created: z.number().nullish(),
  model: z.string().nullish(),
  choices: z.array(
    z.object({
      message: z.object({
        role: z.literal('assistant').nullish(),
        content: z.string().nullish(),
        reasoning_content: z.string().nullish(),
        tool_calls: z
          .array(
            z.object({
              id: z.string().nullish(),
              type: z.literal('function'),
              function: z.object({
                name: z.string(),
                arguments: z.string(),
              }),
            }),
          )
          .nullish(),
      }),
      finish_reason: z.string().nullish(),
    }),
  ),
  usage: openaiCompatibleTokenUsageSchema,
});

// limited version of the schema, focussed on what is needed for the implementation
// this approach limits breakages when the API changes and increases efficiency
const createOpenAICompatibleChatChunkSchema = <ERROR_SCHEMA extends z.ZodType>(
  errorSchema: ERROR_SCHEMA,
) =>
  z.union([
    z.object({
      id: z.string().nullish(),
      created: z.number().nullish(),
      model: z.string().nullish(),
      choices: z.array(
        z.object({
          delta: z
            .object({
              role: z.enum(['assistant']).nullish(),
              content: z.string().nullish(),
              reasoning_content: z.string().nullish(),
              tool_calls: z
                .array(
                  z.object({
                    index: z.number(),
                    id: z.string().nullish(),
                    type: z.literal('function').optional(),
                    function: z.object({
                      name: z.string().nullish(),
                      arguments: z.string().nullish(),
                    }),
                  }),
                )
                .nullish(),
            })
            .nullish(),
          finish_reason: z.string().nullish(),
        }),
      ),
      usage: openaiCompatibleTokenUsageSchema,
    }),
    errorSchema,
  ]);
