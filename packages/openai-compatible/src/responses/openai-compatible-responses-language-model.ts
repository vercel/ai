import {
  APICallError,
  LanguageModelV3,
  LanguageModelV3CallWarning,
  LanguageModelV3Content,
  LanguageModelV3FinishReason,
  LanguageModelV3StreamPart,
  LanguageModelV3Usage,
  SharedV3ProviderMetadata,
} from '@ai-sdk/provider';
import {
  combineHeaders,
  createEventSourceResponseHandler,
  createJsonErrorResponseHandler,
  createJsonResponseHandler,
  FetchFunction,
  parseProviderOptions,
  ParseResult,
  postJsonToApi,
  ResponseHandler,
} from '@ai-sdk/provider-utils';
import { convertToOpenAICompatibleResponsesInput } from './convert-to-openai-compatible-responses-input';
import { mapOpenAICompatibleResponsesFinishReason } from './map-openai-compatible-responses-finish-reason';
import {
  OpenAICompatibleResponsesModelId,
  openaiCompatibleResponsesProviderOptions,
} from './openai-compatible-responses-options';
import { MetadataExtractor } from '../chat/openai-compatible-metadata-extractor';
import { prepareResponsesTools } from './openai-compatible-responses-prepare-tools';
import { OpenAICompatibleResponsesChunk, openaiCompatibleResponsesChunkSchema, OpenAICompatibleResponsesIncludeOptions, OpenAICompatibleResponsesIncludeValue, OpenAICompatibleResponsesLogprobs, openaiCompatibleResponsesResponseSchema } from './openai-compatible-responses-api';
import { ProviderErrorStructure } from '../openai-compatible-error';
import { defaultOpenAICompatibleResponsesErrorStructure } from './openai-compatible-responses-error';

export type OpenAICompatibleResponsesConfig = {
  provider: string;
  headers: () => Record<string, string | undefined>;
  url: (options: { modelId: string; path: string }) => string;
  fetch?: FetchFunction;
  metadataExtractor?: MetadataExtractor;
  errorStructure?: ProviderErrorStructure<any>;

  /**
   * Whether the model supports structured outputs.
   */
  supportsStructuredOutputs?: boolean;

  /**
   * The supported URLs for the model.
   */
  supportedUrls?: () => LanguageModelV3['supportedUrls'];
};

export class OpenAICompatibleResponsesLanguageModel implements LanguageModelV3 {
  readonly specificationVersion = 'v3';

  readonly supportsStructuredOutputs: boolean;

  readonly modelId: OpenAICompatibleResponsesModelId;
  private readonly config: OpenAICompatibleResponsesConfig;
  private readonly failedResponseHandler: ResponseHandler<APICallError>;

  constructor(
    modelId: OpenAICompatibleResponsesModelId,
    config: OpenAICompatibleResponsesConfig,
  ) {
    this.modelId = modelId;
    this.config = config;

    // initialize error handling:
    const errorStructure =
      config.errorStructure ?? defaultOpenAICompatibleResponsesErrorStructure;
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
    presencePenalty,
    frequencyPenalty,
    providerOptions,
    responseFormat,
    toolChoice,
    tools,
  }: Parameters<LanguageModelV3['doGenerate']>[0]) {
    const warnings: LanguageModelV3CallWarning[] = [];

    // Parse provider options
    const compatibleOptions = Object.assign(
      (await parseProviderOptions({
        provider: 'openai-compatible-responses',
        providerOptions,
        schema: openaiCompatibleResponsesProviderOptions,
      })) ?? {},
      (await parseProviderOptions({
        provider: this.providerOptionsName,
        providerOptions,
        schema: openaiCompatibleResponsesProviderOptions,
      })) ?? {},
    );

    if (topK != null) {
      warnings.push({ type: 'unsupported-setting', setting: 'topK' });
    }

    if (presencePenalty != null) {
        warnings.push({ type: 'unsupported-setting', setting: 'presencePenalty'})
    }

    if (frequencyPenalty != null) {
        warnings.push({ type: 'unsupported-setting', setting: 'frequencyPenalty'})
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

    const strictJsonSchema = compatibleOptions?.strictJsonSchema ?? false;

    let include: OpenAICompatibleResponsesIncludeOptions = compatibleOptions?.include;

    function addInclude(key: OpenAICompatibleResponsesIncludeValue) {
      if (include == null) {
        include = [key];
      } else if (!include.includes(key)) {
        include = [...include, key];
      }
    }

    const store = compatibleOptions?.store

    if (store === false && compatibleOptions.reasoningEffort != null) {
      addInclude('reasoning.encrypted_content');
    }

    const { input, warnings: inputWarnings } = await convertToOpenAICompatibleResponsesInput({
        prompt,
        systemMessageMode: 'system', // FIXME: how to pass the systemMessageMode param
        store: compatibleOptions?.store ?? true,
    })

    warnings.push(...inputWarnings);

    const {
      tools: openaiTools,
      toolChoice: openaiToolChoice,
      toolWarnings,
    } = prepareResponsesTools({
      tools,
      toolChoice,
      strictJsonSchema
    });

    warnings.push(...toolWarnings);

    return {
      args: {
        // model id:
        model: this.modelId,

        // model specific settings:
        user: compatibleOptions.user,

        // standardized settings:
        max_output_tokens: maxOutputTokens,
        temperature,
        top_p: topP,
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
        ...Object.fromEntries(
          Object.entries(
            providerOptions?.[this.providerOptionsName] ?? {},
          ).filter(
            ([key]) =>
              !Object.keys(openaiCompatibleResponsesProviderOptions.shape).includes(key),
          ),
        ),

        input,
        ...(
        (compatibleOptions?.reasoningEffort != null ||
          compatibleOptions?.reasoningSummary != null) && {
          reasoning: {
            ...(compatibleOptions?.reasoningEffort != null && {
              effort: compatibleOptions.reasoningEffort,
            }),
            ...(compatibleOptions?.reasoningSummary != null && {
              summary: compatibleOptions.reasoningSummary,
            }),
          },
        }),
        // tools:
        tools: openaiTools,
        tool_choice: openaiToolChoice,
      },
      warnings: [...warnings],
      store
    };
  }

  async doGenerate(
    options: Parameters<LanguageModelV3['doGenerate']>[0],
  ): Promise<Awaited<ReturnType<LanguageModelV3['doGenerate']>>> {
    const { args, warnings } = await this.getArgs({ ...options });

    const body = JSON.stringify(args);

    const url = this.config.url({
      path: '/responses',
      modelId: this.modelId,
    });

    const {
      responseHeaders,
      value: response,
      rawValue: rawResponse,
    } = await postJsonToApi({
      url,
      headers: combineHeaders(this.config.headers(), options.headers),
      body: args,
      failedResponseHandler: this.failedResponseHandler,
      successfulResponseHandler: createJsonResponseHandler(
        openaiCompatibleResponsesResponseSchema
      ),
      abortSignal: options.abortSignal,
      fetch: this.config.fetch,
    });

    if (response.error) {
      throw new APICallError({
        message: response.error.message,
        url,
        requestBodyValues: body,
        statusCode: 400,
        responseHeaders,
        responseBody: rawResponse as string,
        isRetryable: false,
      });
    }

    const content: Array<LanguageModelV3Content> = [];
    const logprobs: Array<OpenAICompatibleResponsesLogprobs> = [];

    // flag that checks if there have been client-side tool calls (not executed by openai)
    let hasFunctionCall = false;

    for (const part of response.output) {
      switch (part.type) {
        case 'reasoning': {
          // when there are no summary parts, we need to add an empty reasoning part:
          if (part.summary.length === 0) {
            part.summary.push({ type: 'summary_text', text: '' });
          }

          for (const summary of part.summary) {
            content.push({
              type: 'reasoning' as const,
              text: summary.text,
              providerMetadata: {
                openai: {
                  itemId: part.id,
                  reasoningEncryptedContent: part.encrypted_content ?? null,
                },
              },
            });
          }
          break;
        }
        case 'message': {
          for (const contentPart of part.content) {
            if (
              options.providerOptions?.[this.providerOptionsName]?.logprobs &&
              contentPart.logprobs
            ) {
              logprobs.push(contentPart.logprobs);
            }

            content.push({
              type: 'text',
              text: contentPart.text,
              providerMetadata: {
                openai: {
                  itemId: part.id,
                },
              },
            });
          }

          break;
        }

        case 'function_call': {
          hasFunctionCall = true;

          content.push({
            type: 'tool-call',
            toolCallId: part.call_id,
            toolName: part.name,
            input: part.arguments,
            providerMetadata: {
              openai: {
                itemId: part.id,
              },
            },
          });
          break;
        }
      }
    }
    // provider metadata:
    const providerMetadata: SharedV3ProviderMetadata = {
      [this.providerOptionsName]: { responseId: response.id },
      ...(await this.config.metadataExtractor?.extractMetadata?.({
        parsedBody: rawResponse,
      })),
    };

    if (logprobs.length > 0) {
      providerMetadata[this.providerOptionsName].logprobs = logprobs;
    }
    if (typeof response.service_tier === 'string') {
      providerMetadata[this.providerOptionsName].serviceTier = response.service_tier;
    }

    return {
      content,
      finishReason: mapOpenAICompatibleResponsesFinishReason({
        finishReason: response.incomplete_details?.reason,
        hasFunctionCall
    }),
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        totalTokens: response.usage.input_tokens + response.usage.output_tokens,
        reasoningTokens:
          response.usage?.output_tokens_details?.reasoning_tokens ??
          undefined,
        cachedInputTokens:
          response.usage.input_tokens_details?.cached_tokens ?? undefined,
      },
      providerMetadata,
      request: { body },
      response: {
        id: response.id,
        timestamp: new Date(response.created_at * 1000),
        modelId: response.model,
        headers: responseHeaders,
        body: rawResponse,
      },
      warnings,
    };
  }

  async doStream(
    options: Parameters<LanguageModelV3['doStream']>[0],
  ): Promise<Awaited<ReturnType<LanguageModelV3['doStream']>>> {
    const { args, warnings, store } = await this.getArgs({ ...options });

    const body = {
      ...args,
      stream: true,
    };

    const metadataExtractor =
      this.config.metadataExtractor?.createStreamExtractor();

    const { responseHeaders, value: response } = await postJsonToApi({
      url: this.config.url({
        path: '/responses',
        modelId: this.modelId,
      }),
      headers: combineHeaders(this.config.headers(), options.headers),
      body,
      failedResponseHandler: this.failedResponseHandler,
      successfulResponseHandler: createEventSourceResponseHandler(
        openaiCompatibleResponsesChunkSchema
      ),
      abortSignal: options.abortSignal,
      fetch: this.config.fetch,
    });

    let finishReason: LanguageModelV3FinishReason = 'unknown';
    const usage: LanguageModelV3Usage = {
      inputTokens: undefined,
      outputTokens: undefined,
      totalTokens: undefined,
    };
    const logprobs: Array<OpenAICompatibleResponsesLogprobs> = [];
    let responseId: string | null = null;

    const ongoingToolCalls: Record<
      number,
      | {
          toolName: string;
          toolCallId: string;
        }
      | undefined
    > = {};

    const providerOptionsName = this.providerOptionsName;
    // flag that checks if there have been client-side tool calls (not executed by openai)
    let hasFunctionCall = false;

    const activeReasoning: Record<
      string,
      {
        encryptedContent?: string | null;
        // summary index as string to reasoning part state:
        summaryParts: Record<string, 'active' | 'can-conclude' | 'concluded'>;
      }
    > = {};

    let serviceTier: string | undefined;

    return {
      stream: response.pipeThrough(
        new TransformStream<
          ParseResult<OpenAICompatibleResponsesChunk>,
          LanguageModelV3StreamPart
        >({
          start(controller) {
            controller.enqueue({ type: 'stream-start', warnings });
          },

          transform(chunk, controller) {
            // Emit raw chunk if requested (before anything else)
            if (options.includeRawChunks) {
              controller.enqueue({ type: 'raw', rawValue: chunk.rawValue });
            }

            // handle failed chunk parsing / validation:
            if (!chunk.success) {
              finishReason = 'error';
              controller.enqueue({ type: 'error', error: chunk.error });
              return;
            }
            const value = chunk.value;

            metadataExtractor?.processChunk(chunk.rawValue);

            if (isResponseOutputItemAddedChunk(value)) {
                if (value.item.type === 'function_call') {
                ongoingToolCalls[value.output_index] = {
                  toolName: value.item.name,
                  toolCallId: value.item.call_id,
                };

                controller.enqueue({
                  type: 'tool-input-start',
                  id: value.item.call_id,
                  toolName: value.item.name,
                });
              } else if (value.item.type === 'message') {
                controller.enqueue({
                  type: 'text-start',
                  id: value.item.id,
                  providerMetadata: {
                    openai: {
                      itemId: value.item.id,
                    },
                  },
                });
              } else if (
                isResponseOutputItemAddedChunk(value) &&
                value.item.type === 'reasoning'
              ) {
                activeReasoning[value.item.id] = {
                  encryptedContent: value.item.encrypted_content,
                  summaryParts: { 0: 'active' },
                };

                controller.enqueue({
                  type: 'reasoning-start',
                  id: `${value.item.id}:0`,
                  providerMetadata: {
                    openai: {
                      itemId: value.item.id,
                      reasoningEncryptedContent:
                        value.item.encrypted_content ?? null,
                    },
                  },
                });
              }
            } else if (isResponseOutputItemDoneChunk(value)) {
                if (value.item.type === 'function_call') {
                ongoingToolCalls[value.output_index] = undefined;
                hasFunctionCall = true;

                controller.enqueue({
                  type: 'tool-input-end',
                  id: value.item.call_id,
                });

                controller.enqueue({
                  type: 'tool-call',
                  toolCallId: value.item.call_id,
                  toolName: value.item.name,
                  input: value.item.arguments,
                  providerMetadata: {
                    providerOptionsName: {
                      itemId: value.item.id,
                    },
                  },
                });
              } if (value.item.type === 'message') {
                controller.enqueue({
                  type: 'text-end',
                  id: value.item.id,
                });
              } else if (value.item.type === 'reasoning') {
                const activeReasoningPart = activeReasoning[value.item.id];

                // get all active or can-conclude summary parts' ids
                // to conclude ongoing reasoning parts:
                const summaryPartIndices = Object.entries(
                  activeReasoningPart.summaryParts,
                )
                  .filter(
                    ([_, status]) =>
                      status === 'active' || status === 'can-conclude',
                  )
                  .map(([summaryIndex]) => summaryIndex);

                for (const summaryIndex of summaryPartIndices) {
                  controller.enqueue({
                    type: 'reasoning-end',
                    id: `${value.item.id}:${summaryIndex}`,
                    providerMetadata: {
                      openai: {
                        itemId: value.item.id,
                        reasoningEncryptedContent:
                          value.item.encrypted_content ?? null,
                      },
                    },
                  });
                }

                delete activeReasoning[value.item.id];
              }
            } else if (isResponseFunctionCallArgumentsDeltaChunk(value)) {
                const toolCall = ongoingToolCalls[value.output_index];

              if (toolCall != null) {
                controller.enqueue({
                  type: 'tool-input-delta',
                  id: toolCall.toolCallId,
                  delta: value.delta,
                });
              }
            } else if (isResponseCreatedChunk(value)) {
                responseId = value.response.id;
                controller.enqueue({
                    type: 'response-metadata',
                    id: value.response.id,
                    timestamp: new Date(value.response.created_at * 1000),
                    modelId: value.response.model,
                });
            } else if (isTextDeltaChunk(value)) {
                controller.enqueue({
                type: 'text-delta',
                id: value.item_id,
                delta: value.delta,
              });

              if (options.providerOptions?.[providerOptionsName]?.logprobs && value.logprobs) {
                logprobs.push(value.logprobs);
              }
            } else if (value.type === 'response.reasoning_summary_part.added') {
                // the first reasoning start is pushed in isResponseOutputItemAddedReasoningChunk
              if (value.summary_index > 0) {
                const activeReasoningPart = activeReasoning[value.item_id]!;

                activeReasoningPart.summaryParts[value.summary_index] =
                  'active';

                // since there is a new active summary part, we can conclude all can-conclude summary parts
                for (const summaryIndex of Object.keys(
                  activeReasoningPart.summaryParts,
                )) {
                  if (
                    activeReasoningPart.summaryParts[summaryIndex] ===
                    'can-conclude'
                  ) {
                    controller.enqueue({
                      type: 'reasoning-end',
                      id: `${value.item_id}:${summaryIndex}`,
                      providerMetadata: { providerOptionsName: { itemId: value.item_id } },
                    });
                    activeReasoningPart.summaryParts[summaryIndex] =
                      'concluded';
                  }
                }

                controller.enqueue({
                  type: 'reasoning-start',
                  id: `${value.item_id}:${value.summary_index}`,
                  providerMetadata: {
                    providerOptionsName: {
                      itemId: value.item_id,
                      reasoningEncryptedContent:
                        activeReasoning[value.item_id]?.encryptedContent ??
                        null,
                    },
                  },
                });
              }
            } else if (value.type === 'response.reasoning_summary_text.delta') {
              controller.enqueue({
                type: 'reasoning-delta',
                id: `${value.item_id}:${value.summary_index}`,
                delta: value.delta,
                providerMetadata: {
                  providerOptionsName: {
                    itemId: value.item_id,
                  },
                },
              });
            } else if (value.type === 'response.reasoning_summary_part.done') {
              // when OpenAI stores the message data, we can immediately conclude the reasoning part
              // since we do not need to send the encrypted content.
              if (store) {
                controller.enqueue({
                  type: 'reasoning-end',
                  id: `${value.item_id}:${value.summary_index}`,
                  providerMetadata: {
                    providerOptionsName: { itemId: value.item_id },
                  },
                });

                // mark the summary part as concluded
                activeReasoning[value.item_id]!.summaryParts[
                  value.summary_index
                ] = 'concluded';
              } else {
                // mark the summary part as can-conclude only
                // because we need to have a final summary part with the encrypted content
                activeReasoning[value.item_id]!.summaryParts[
                  value.summary_index
                ] = 'can-conclude';
              }
            } else if (isResponseFinishedChunk(value)) {
                finishReason = mapOpenAICompatibleResponsesFinishReason({
                finishReason: value.response.incomplete_details?.reason,
                hasFunctionCall,
              });
              usage.inputTokens = value.response.usage.input_tokens;
              usage.outputTokens = value.response.usage.output_tokens;
              usage.totalTokens =
                value.response.usage.input_tokens +
                value.response.usage.output_tokens;
              usage.reasoningTokens =
                value.response.usage.output_tokens_details?.reasoning_tokens ??
                undefined;
              usage.cachedInputTokens =
                value.response.usage.input_tokens_details?.cached_tokens ??
                undefined;
              if (typeof value.response.service_tier === 'string') {
                serviceTier = value.response.service_tier;
              }
            } else if (isErrorChunk(value)) {
                controller.enqueue({ type: 'error', error: value });
            }
          },

          flush(controller) {
            const providerMetadata: SharedV3ProviderMetadata = {
              providerOptionsName: {
                responseId,
              },
              ...metadataExtractor?.buildMetadata(),
            };

            if (logprobs.length > 0) {
              providerMetadata.providerOptionsName.logprobs = logprobs;
            }

            if (serviceTier !== undefined) {
              providerMetadata.providerOptionsName.serviceTier = serviceTier;
            }

            controller.enqueue({
              type: 'finish',
              finishReason,
              usage,
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

function isTextDeltaChunk(
  chunk: OpenAICompatibleResponsesChunk,
): chunk is OpenAICompatibleResponsesChunk & { type: 'response.output_text.delta' } {
  return chunk.type === 'response.output_text.delta';
}


function isResponseFinishedChunk(
  chunk: OpenAICompatibleResponsesChunk,
): chunk is OpenAICompatibleResponsesChunk & {
  type: 'response.completed' | 'response.incomplete';
} {
  return (
    chunk.type === 'response.completed' || chunk.type === 'response.incomplete'
  );
}

function isResponseCreatedChunk(
  chunk: OpenAICompatibleResponsesChunk,
): chunk is OpenAICompatibleResponsesChunk & { type: 'response.created' } {
  return chunk.type === 'response.created';
}

function isResponseFunctionCallArgumentsDeltaChunk(
  chunk: OpenAICompatibleResponsesChunk,
): chunk is OpenAICompatibleResponsesChunk & {
  type: 'response.function_call_arguments.delta';
} {
  return chunk.type === 'response.function_call_arguments.delta';
}

function isResponseOutputItemAddedChunk(
  chunk: OpenAICompatibleResponsesChunk,
): chunk is OpenAICompatibleResponsesChunk & { type: 'response.output_item.added' } {
  return chunk.type === 'response.output_item.added';
}

function isResponseOutputItemDoneChunk(
  chunk: OpenAICompatibleResponsesChunk,
): chunk is OpenAICompatibleResponsesChunk & { type: 'response.output_item.done' } {
  return chunk.type === 'response.output_item.done';
}

function isErrorChunk(
  chunk: OpenAICompatibleResponsesChunk,
): chunk is OpenAICompatibleResponsesChunk & { type: 'error' } {
  return chunk.type === 'error';
}
