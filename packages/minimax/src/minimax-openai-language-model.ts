import {
  APICallError,
  InvalidResponseDataError,
  LanguageModelV3,
  LanguageModelV3CallWarning,
  LanguageModelV3Content,
  LanguageModelV3FinishReason,
  LanguageModelV3StreamPart,
  SharedV3ProviderMetadata,
} from '@ai-sdk/provider';
import {
  combineHeaders,
  createEventSourceResponseHandler,
  createJsonErrorResponseHandler,
  createJsonResponseHandler,
  FetchFunction,
  generateId,
  isParsableJson,
  parseProviderOptions,
  ParseResult,
  postJsonToApi,
  ResponseHandler,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';
import { MetadataExtractor } from './minimax-metadata-extractor';
import { convertToMinimaxChatMessages } from './convert-to-minimax-chat-messages';
import {
  MinimaxChatModelId,
  minimaxChatProviderOptions,
  defaultMinimaxErrorStructure,
  ProviderErrorStructure,
} from './minimax-chat-options';
import { prepareTools } from './minimax-openai-prepare-tools';

function getResponseMetadata({
  id,
  model,
  created,
}: {
  id?: string | undefined | null;
  created?: number | undefined | null;
  model?: string | undefined | null;
}) {
  return {
    id: id ?? undefined,
    modelId: model ?? undefined,
    timestamp: created != null ? new Date(created * 1000) : undefined,
  };
}

function mapOpenAICompatibleFinishReason(
  finishReason: string | null | undefined,
): LanguageModelV3FinishReason {
  switch (finishReason) {
    case 'stop':
      return 'stop';
    case 'length':
      return 'length';
    case 'content_filter':
      return 'content-filter';
    case 'function_call':
    case 'tool_calls':
      return 'tool-calls';
    default:
      return 'unknown';
  }
}

export type MinimaxChatConfig = {
  provider: string;
  headers: () => Record<string, string | undefined>;
  url: (options: { modelId: string; path: string }) => string;
  fetch?: FetchFunction;
  includeUsage?: boolean;
  errorStructure?: ProviderErrorStructure<any>;
  metadataExtractor?: MetadataExtractor;
  supportsStructuredOutputs?: boolean;
  supportedUrls?: () => LanguageModelV3['supportedUrls'];
};

export class MinimaxChatLanguageModel implements LanguageModelV3 {
  readonly specificationVersion = 'v3';
  readonly supportsStructuredOutputs: boolean;
  readonly modelId: MinimaxChatModelId;

  private readonly config: MinimaxChatConfig;
  private readonly failedResponseHandler: ResponseHandler<APICallError>;
  private readonly chunkSchema;

  constructor(
    modelId: MinimaxChatModelId,
    config: MinimaxChatConfig,
  ) {
    this.modelId = modelId;
    this.config = config;

    const errorStructure =
      config.errorStructure ?? defaultMinimaxErrorStructure;
    this.chunkSchema = createOpenAICompatibleChatChunkSchema(
      errorStructure.errorSchema,
    );
    this.failedResponseHandler = createJsonErrorResponseHandler(errorStructure);
    this.supportsStructuredOutputs = config.supportsStructuredOutputs ?? false;
  }

  get provider(): string {
    return this.config.provider;
  }

  private get providerOptionsName(): string {
    return this.config.provider.split('.')[0].trim();
  }

  get supportedUrls() {
    return this.config.supportedUrls?.() ?? {};
  }

  private async getArgs({
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
  }: Parameters<LanguageModelV3['doGenerate']>[0]) {
    const warnings: LanguageModelV3CallWarning[] = [];

    const compatibleOptions = Object.assign(
      (await parseProviderOptions({
        provider: 'openai-compatible',
        providerOptions,
        schema: minimaxChatProviderOptions,
      })) ?? {},
      (await parseProviderOptions({
        provider: this.providerOptionsName,
        providerOptions,
        schema: minimaxChatProviderOptions,
      })) ?? {},
    );

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
        model: this.modelId,
        user: compatibleOptions.user,
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
        ...Object.fromEntries(
          Object.entries(
            providerOptions?.[this.providerOptionsName] ?? {},
          ).filter(
            ([key]) =>
              !Object.keys(minimaxChatProviderOptions.shape).includes(key),
          ),
        ),
        reasoning_effort: compatibleOptions.reasoningEffort,
        verbosity: compatibleOptions.textVerbosity,

        // MiniMax specific: enable reasoning_split for M2 models
        reasoning_split: true,

        messages: convertToMinimaxChatMessages(prompt),
        tools: openaiTools,
        tool_choice: openaiToolChoice,
      },
      warnings: [...warnings, ...toolWarnings],
    };
  }

  async doGenerate(
    options: Parameters<LanguageModelV3['doGenerate']>[0],
  ): Promise<Awaited<ReturnType<LanguageModelV3['doGenerate']>>> {
    const { args, warnings } = await this.getArgs({ ...options });
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
        MinimaxChatResponseSchema,
      ),
      abortSignal: options.abortSignal,
      fetch: this.config.fetch,
    });

    const choice = responseBody.choices[0];
    const content: Array<LanguageModelV3Content> = [];

    // text content
    const text = choice.message.content;
    if (text != null && text.length > 0) {
      content.push({ type: 'text', text });
    }

    // reasoning content - extract from reasoning_details
    if (choice.message.reasoning_details?.length) {
      const reasoningBlock = choice.message.reasoning_details.find(
        (block: any) => block.type === 'reasoning.text'
      );

      if (reasoningBlock?.text) {
        content.push({
          type: 'reasoning',
          text: reasoningBlock.text,
          // Store original reasoning_details in providerMetadata for round-trip
          providerMetadata: {
            minimax: {
              reasoningDetails: choice.message.reasoning_details,
            },
          },
        });
      }
    }

    // tool calls
    if (choice.message.tool_calls != null) {
      for (const toolCall of choice.message.tool_calls) {
        content.push({
          type: 'tool-call',
          toolCallId: toolCall.id ?? generateId(),
          toolName: toolCall.function.name,
          input: toolCall.function.arguments!,
        });
      }
    }

    const providerMetadata: SharedV3ProviderMetadata = {
      [this.providerOptionsName]: {},
      ...(await this.config.metadataExtractor?.extractMetadata?.({
        parsedBody: rawResponse,
      })),
    };

    const completionTokenDetails =
      responseBody.usage?.completion_tokens_details;
    if (completionTokenDetails?.accepted_prediction_tokens != null) {
      providerMetadata[this.providerOptionsName].acceptedPredictionTokens =
        completionTokenDetails?.accepted_prediction_tokens;
    }
    if (completionTokenDetails?.rejected_prediction_tokens != null) {
      providerMetadata[this.providerOptionsName].rejectedPredictionTokens =
        completionTokenDetails?.rejected_prediction_tokens;
    }

    return {
      content,
      finishReason: mapOpenAICompatibleFinishReason(choice.finish_reason),
      usage: {
        inputTokens: responseBody.usage?.prompt_tokens ?? undefined,
        outputTokens: responseBody.usage?.completion_tokens ?? undefined,
        totalTokens: responseBody.usage?.total_tokens ?? undefined,
        reasoningTokens:
          responseBody.usage?.completion_tokens_details?.reasoning_tokens ??
          undefined,
        cachedInputTokens:
          responseBody.usage?.prompt_tokens_details?.cached_tokens ?? undefined,
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
    options: Parameters<LanguageModelV3['doStream']>[0],
  ): Promise<Awaited<ReturnType<LanguageModelV3['doStream']>>> {
    const { args, warnings } = await this.getArgs({ ...options });

    const body = {
      ...args,
      stream: true,
      stream_options: this.config.includeUsage
        ? { include_usage: true }
        : undefined,
    };

    const metadataExtractor =
      this.config.metadataExtractor?.createStreamExtractor();

    const { responseHeaders, value: response } = await postJsonToApi({
      url: this.config.url({
        path: '/chat/completions',
        modelId: this.modelId,
      }),
      headers: combineHeaders(this.config.headers(), options.headers),
      body,
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

    let finishReason: LanguageModelV3FinishReason = 'unknown';
    const usage: {
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
      totalTokens: number | undefined;
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
      totalTokens: undefined,
    };
    let isFirstChunk = true;
    const providerOptionsName = this.providerOptionsName;
    let isActiveReasoning = false;
    let isActiveText = false;
    let accumulatedReasoningDetails: any[] = []; // Accumulate reasoning_details for round-trip

    return {
      stream: response.pipeThrough(
        new TransformStream<
          ParseResult<z.infer<typeof this.chunkSchema>>,
          LanguageModelV3StreamPart
        >({
          start(controller) {
            controller.enqueue({ type: 'stream-start', warnings });
          },

          transform(chunk, controller) {
            if (options.includeRawChunks) {
              controller.enqueue({ type: 'raw', rawValue: chunk.rawValue });
            }

            if (!chunk.success) {
              finishReason = 'error';
              controller.enqueue({ type: 'error', error: chunk.error });
              return;
            }
            const value = chunk.value;

            metadataExtractor?.processChunk(chunk.rawValue);

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
                total_tokens,
                prompt_tokens_details,
                completion_tokens_details,
              } = value.usage;

              usage.promptTokens = prompt_tokens ?? undefined;
              usage.completionTokens = completion_tokens ?? undefined;
              usage.totalTokens = total_tokens ?? undefined;
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

            // Handle reasoning_details for streaming
            if (delta.reasoning_details?.length) {
              // Accumulate reasoning_details for round-trip
              // Replace or append based on whether we've seen this before
              if (accumulatedReasoningDetails.length === 0) {
                accumulatedReasoningDetails = delta.reasoning_details;
              } else {
                // Merge reasoning_details blocks
                for (const block of delta.reasoning_details) {
                  const existingIndex = accumulatedReasoningDetails.findIndex(
                    (b: any) => b.type === block.type && b.id === block.id
                  );
                  if (existingIndex >= 0) {
                    // Update existing block (merge text if needed)
                    const existing = accumulatedReasoningDetails[existingIndex];
                    if (block.text) {
                      existing.text = (existing.text || '') + block.text;
                    }
                  } else {
                    // Add new block
                    accumulatedReasoningDetails.push({ ...block });
                  }
                }
              }

              const reasoningBlock = delta.reasoning_details.find(
                (block: any) => block.type === 'reasoning.text'
              );

              if (reasoningBlock?.text) {
                if (!isActiveReasoning) {
                  controller.enqueue({
                    type: 'reasoning-start',
                    id: 'reasoning-0',
                  });
                  isActiveReasoning = true;
                }

                controller.enqueue({
                  type: 'reasoning-delta',
                  id: 'reasoning-0',
                  delta: reasoningBlock.text,
                });
              }
            }

            if (delta.content) {
              if (!isActiveText) {
                controller.enqueue({ type: 'text-start', id: 'txt-0' });
                isActiveText = true;
              }

              controller.enqueue({
                type: 'text-delta',
                id: 'txt-0',
                delta: delta.content,
              });
            }

            if (delta.tool_calls != null) {
              for (const toolCallDelta of delta.tool_calls) {
                const index = toolCallDelta.index;

                if (toolCalls[index] == null) {
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

                  controller.enqueue({
                    type: 'tool-input-start',
                    id: toolCallDelta.id,
                    toolName: toolCallDelta.function.name,
                  });

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
                    if (toolCall.function.arguments.length > 0) {
                      controller.enqueue({
                        type: 'tool-input-delta',
                        id: toolCall.id,
                        delta: toolCall.function.arguments,
                      });
                    }

                    if (isParsableJson(toolCall.function.arguments)) {
                      controller.enqueue({
                        type: 'tool-input-end',
                        id: toolCall.id,
                      });

                      controller.enqueue({
                        type: 'tool-call',
                        toolCallId: toolCall.id ?? generateId(),
                        toolName: toolCall.function.name,
                        input: toolCall.function.arguments,
                      });
                      toolCall.hasFinished = true;
                    }
                  }

                  continue;
                }

                const toolCall = toolCalls[index];

                if (toolCall.hasFinished) {
                  continue;
                }

                if (toolCallDelta.function?.arguments != null) {
                  toolCall.function!.arguments +=
                    toolCallDelta.function?.arguments ?? '';
                }

                controller.enqueue({
                  type: 'tool-input-delta',
                  id: toolCall.id,
                  delta: toolCallDelta.function.arguments ?? '',
                });

                if (
                  toolCall.function?.name != null &&
                  toolCall.function?.arguments != null &&
                  isParsableJson(toolCall.function.arguments)
                ) {
                  controller.enqueue({
                    type: 'tool-input-end',
                    id: toolCall.id,
                  });

                  controller.enqueue({
                    type: 'tool-call',
                    toolCallId: toolCall.id ?? generateId(),
                    toolName: toolCall.function.name,
                    input: toolCall.function.arguments,
                  });
                  toolCall.hasFinished = true;
                }
              }
            }
          },

          flush(controller) {
            if (isActiveReasoning) {
              controller.enqueue({
                type: 'reasoning-end',
                id: 'reasoning-0',
                // Attach reasoning_details for round-trip
                providerMetadata: accumulatedReasoningDetails.length > 0 ? {
                  minimax: {
                    reasoningDetails: accumulatedReasoningDetails,
                  },
                } : undefined,
              });
            }

            if (isActiveText) {
              controller.enqueue({ type: 'text-end', id: 'txt-0' });
            }

            for (const toolCall of toolCalls.filter(
              toolCall => !toolCall.hasFinished,
            )) {
              controller.enqueue({
                type: 'tool-input-end',
                id: toolCall.id,
              });

              controller.enqueue({
                type: 'tool-call',
                toolCallId: toolCall.id ?? generateId(),
                toolName: toolCall.function.name,
                input: toolCall.function.arguments,
              });
            }

            const providerMetadata: SharedV3ProviderMetadata = {
              [providerOptionsName]: {},
              ...metadataExtractor?.buildMetadata(),
            };
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

            controller.enqueue({
              type: 'finish',
              finishReason,
              usage: {
                inputTokens: usage.promptTokens ?? undefined,
                outputTokens: usage.completionTokens ?? undefined,
                totalTokens: usage.totalTokens ?? undefined,
                reasoningTokens:
                  usage.completionTokensDetails.reasoningTokens ?? undefined,
                cachedInputTokens:
                  usage.promptTokensDetails.cachedTokens ?? undefined,
              },
              providerMetadata,
            });
          },
        }),
      ),
      request: { body },
      response: { headers: responseHeaders },
    };
  }
}

// Schema definitions
const openaiCompatibleTokenUsageSchema = z
  .object({
    prompt_tokens: z.number().nullish(),
    completion_tokens: z.number().nullish(),
    total_tokens: z.number().nullish(),
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

// MiniMax specific response schema with reasoning_details
const MinimaxChatResponseSchema = z.object({
  id: z.string().nullish(),
  created: z.number().nullish(),
  model: z.string().nullish(),
  choices: z.array(
    z.object({
      message: z.object({
        role: z.literal('assistant').nullish(),
        content: z.string().nullish(),
        reasoning_details: z.array(z.any()).nullish(), // MiniMax specific
        tool_calls: z
          .array(
            z.object({
              id: z.string().nullish(),
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

// Chunk schema for streaming
const createOpenAICompatibleChatChunkSchema = <
  ERROR_SCHEMA extends z.core.$ZodType,
>(
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
              reasoning_details: z.array(z.any()).nullish(), // MiniMax specific
              tool_calls: z
                .array(
                  z.object({
                    index: z.number(),
                    id: z.string().nullish(),
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

