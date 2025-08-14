import {
  APICallError,
  LanguageModelV2,
  LanguageModelV2CallWarning,
  LanguageModelV2Content,
  LanguageModelV2FinishReason,
  LanguageModelV2StreamPart,
  LanguageModelV2Text,
  LanguageModelV2Usage,
  SharedV2ProviderMetadata,
} from '@ai-sdk/provider';
import {
  combineHeaders,
  createEventSourceResponseHandler,
  createJsonResponseHandler,
  generateId,
  parseProviderOptions,
  ParseResult,
  postJsonToApi,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';
import { OpenAIConfig } from '../openai-config';
import { openaiFailedResponseHandler } from '../openai-error';
import { convertToOpenAIResponsesMessages } from './convert-to-openai-responses-messages';
import { mapOpenAIResponseFinishReason } from './map-openai-responses-finish-reason';
import { prepareResponsesTools } from './openai-responses-prepare-tools';
import { OpenAIResponsesModelId } from './openai-responses-settings';

/**
 * `top_logprobs` request body argument can be set to an integer between
 * 0 and 20 specifying the number of most likely tokens to return at each
 * token position, each with an associated log probability.
 *
 * @see https://platform.openai.com/docs/api-reference/responses/create#responses_create-top_logprobs
 */
const TOP_LOGPROBS_MAX = 20;

const LOGPROBS_SCHEMA = z.array(
  z.object({
    token: z.string(),
    logprob: z.number(),
    top_logprobs: z.array(
      z.object({
        token: z.string(),
        logprob: z.number(),
      }),
    ),
  }),
);

export class OpenAIResponsesLanguageModel implements LanguageModelV2 {
  readonly specificationVersion = 'v2';

  readonly modelId: OpenAIResponsesModelId;

  private readonly config: OpenAIConfig;

  constructor(modelId: OpenAIResponsesModelId, config: OpenAIConfig) {
    this.modelId = modelId;
    this.config = config;
  }

  readonly supportedUrls: Record<string, RegExp[]> = {
    'image/*': [/^https?:\/\/.*$/],
  };

  get provider(): string {
    return this.config.provider;
  }

  private async getArgs({
    maxOutputTokens,
    temperature,
    stopSequences,
    topP,
    topK,
    presencePenalty,
    frequencyPenalty,
    seed,
    prompt,
    providerOptions,
    tools,
    toolChoice,
    responseFormat,
  }: Parameters<LanguageModelV2['doGenerate']>[0]) {
    const warnings: LanguageModelV2CallWarning[] = [];
    const modelConfig = getResponsesModelConfig(this.modelId);

    if (topK != null) {
      warnings.push({ type: 'unsupported-setting', setting: 'topK' });
    }

    if (seed != null) {
      warnings.push({ type: 'unsupported-setting', setting: 'seed' });
    }

    if (presencePenalty != null) {
      warnings.push({
        type: 'unsupported-setting',
        setting: 'presencePenalty',
      });
    }

    if (frequencyPenalty != null) {
      warnings.push({
        type: 'unsupported-setting',
        setting: 'frequencyPenalty',
      });
    }

    if (stopSequences != null) {
      warnings.push({ type: 'unsupported-setting', setting: 'stopSequences' });
    }

    const { messages, warnings: messageWarnings } =
      await convertToOpenAIResponsesMessages({
        prompt,
        systemMessageMode: modelConfig.systemMessageMode,
        fileIdPrefixes: this.config.fileIdPrefixes,
      });

    warnings.push(...messageWarnings);

    const openaiOptions = await parseProviderOptions({
      provider: 'openai',
      providerOptions,
      schema: openaiResponsesProviderOptionsSchema,
    });

    const strictJsonSchema = openaiOptions?.strictJsonSchema ?? false;

    const topLogprobs =
      typeof openaiOptions?.logprobs === 'number'
        ? openaiOptions?.logprobs
        : openaiOptions?.logprobs === true
          ? TOP_LOGPROBS_MAX
          : undefined;
    const openaiOptionsInclude = topLogprobs
      ? Array.isArray(openaiOptions?.include)
        ? [...openaiOptions?.include, 'message.output_text.logprobs']
        : ['message.output_text.logprobs']
      : openaiOptions?.include;

    const baseArgs = {
      model: this.modelId,
      input: messages,
      temperature,
      top_p: topP,
      max_output_tokens: maxOutputTokens,

      ...((responseFormat?.type === 'json' || openaiOptions?.textVerbosity) && {
        text: {
          ...(responseFormat?.type === 'json' && {
            format:
              responseFormat.schema != null
                ? {
                    type: 'json_schema',
                    strict: strictJsonSchema,
                    name: responseFormat.name ?? 'response',
                    description: responseFormat.description,
                    schema: responseFormat.schema,
                  }
                : { type: 'json_object' },
          }),
          ...(openaiOptions?.textVerbosity && {
            verbosity: openaiOptions.textVerbosity,
          }),
        },
      }),

      // provider options:
      metadata: openaiOptions?.metadata,
      parallel_tool_calls: openaiOptions?.parallelToolCalls,
      previous_response_id: openaiOptions?.previousResponseId,
      store: openaiOptions?.store,
      user: openaiOptions?.user,
      instructions: openaiOptions?.instructions,
      service_tier: openaiOptions?.serviceTier,
      include: openaiOptionsInclude,
      prompt_cache_key: openaiOptions?.promptCacheKey,
      safety_identifier: openaiOptions?.safetyIdentifier,
      top_logprobs: topLogprobs,

      // model-specific settings:
      ...(modelConfig.isReasoningModel &&
        (openaiOptions?.reasoningEffort != null ||
          openaiOptions?.reasoningSummary != null) && {
          reasoning: {
            ...(openaiOptions?.reasoningEffort != null && {
              effort: openaiOptions.reasoningEffort,
            }),
            ...(openaiOptions?.reasoningSummary != null && {
              summary: openaiOptions.reasoningSummary,
            }),
          },
        }),
      ...(modelConfig.requiredAutoTruncation && {
        truncation: 'auto',
      }),
    };

    if (modelConfig.isReasoningModel) {
      // remove unsupported settings for reasoning models
      // see https://platform.openai.com/docs/guides/reasoning#limitations
      if (baseArgs.temperature != null) {
        baseArgs.temperature = undefined;
        warnings.push({
          type: 'unsupported-setting',
          setting: 'temperature',
          details: 'temperature is not supported for reasoning models',
        });
      }

      if (baseArgs.top_p != null) {
        baseArgs.top_p = undefined;
        warnings.push({
          type: 'unsupported-setting',
          setting: 'topP',
          details: 'topP is not supported for reasoning models',
        });
      }
    } else {
      if (openaiOptions?.reasoningEffort != null) {
        warnings.push({
          type: 'unsupported-setting',
          setting: 'reasoningEffort',
          details: 'reasoningEffort is not supported for non-reasoning models',
        });
      }

      if (openaiOptions?.reasoningSummary != null) {
        warnings.push({
          type: 'unsupported-setting',
          setting: 'reasoningSummary',
          details: 'reasoningSummary is not supported for non-reasoning models',
        });
      }
    }

    // Validate flex processing support
    if (
      openaiOptions?.serviceTier === 'flex' &&
      !supportsFlexProcessing(this.modelId)
    ) {
      warnings.push({
        type: 'unsupported-setting',
        setting: 'serviceTier',
        details:
          'flex processing is only available for o3, o4-mini, and gpt-5 models',
      });
      // Remove from args if not supported
      delete (baseArgs as any).service_tier;
    }

    // Validate priority processing support
    if (
      openaiOptions?.serviceTier === 'priority' &&
      !supportsPriorityProcessing(this.modelId)
    ) {
      warnings.push({
        type: 'unsupported-setting',
        setting: 'serviceTier',
        details:
          'priority processing is only available for supported models (gpt-4, gpt-5, gpt-5-mini, o3, o4-mini) and requires Enterprise access. gpt-5-nano is not supported',
      });
      // Remove from args if not supported
      delete (baseArgs as any).service_tier;
    }

    const {
      tools: openaiTools,
      toolChoice: openaiToolChoice,
      toolWarnings,
    } = prepareResponsesTools({
      tools,
      toolChoice,
      strictJsonSchema,
    });

    return {
      args: {
        ...baseArgs,
        tools: openaiTools,
        tool_choice: openaiToolChoice,
      },
      warnings: [...warnings, ...toolWarnings],
    };
  }

  async doGenerate(
    options: Parameters<LanguageModelV2['doGenerate']>[0],
  ): Promise<Awaited<ReturnType<LanguageModelV2['doGenerate']>>> {
    const { args: body, warnings } = await this.getArgs(options);
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
      body,
      failedResponseHandler: openaiFailedResponseHandler,
      successfulResponseHandler: createJsonResponseHandler(
        z.object({
          id: z.string(),
          created_at: z.number(),
          error: z
            .object({
              code: z.string(),
              message: z.string(),
            })
            .nullish(),
          model: z.string(),
          output: z.array(
            z.discriminatedUnion('type', [
              z.object({
                type: z.literal('message'),
                role: z.literal('assistant'),
                id: z.string(),
                content: z.array(
                  z.object({
                    type: z.literal('output_text'),
                    text: z.string(),
                    logprobs: LOGPROBS_SCHEMA.nullish(),
                    annotations: z.array(
                      z.discriminatedUnion('type', [
                        z.object({
                          type: z.literal('url_citation'),
                          start_index: z.number(),
                          end_index: z.number(),
                          url: z.string(),
                          title: z.string(),
                        }),
                        z.object({
                          type: z.literal('file_citation'),
                          start_index: z.number(),
                          end_index: z.number(),
                          file_id: z.string(),
                          quote: z.string(),
                        }),
                      ]),
                    ),
                  }),
                ),
              }),
              z.object({
                type: z.literal('function_call'),
                call_id: z.string(),
                name: z.string(),
                arguments: z.string(),
                id: z.string(),
              }),
              z.object({
                type: z.literal('web_search_call'),
                id: z.string(),
                status: z.string().optional(),
              }),
              z.object({
                type: z.literal('computer_call'),
                id: z.string(),
                status: z.string().optional(),
              }),
              z.object({
                type: z.literal('file_search_call'),
                id: z.string(),
                status: z.string().optional(),
                queries: z.array(z.string()).nullish(),
                results: z
                  .array(
                    z.object({
                      attributes: z.object({
                        file_id: z.string(),
                        filename: z.string(),
                        score: z.number(),
                        text: z.string(),
                      }),
                    }),
                  )
                  .nullish(),
              }),
              z.object({
                type: z.literal('reasoning'),
                id: z.string(),
                encrypted_content: z.string().nullish(),
                summary: z.array(
                  z.object({
                    type: z.literal('summary_text'),
                    text: z.string(),
                  }),
                ),
              }),
            ]),
          ),
          incomplete_details: z.object({ reason: z.string() }).nullable(),
          usage: usageSchema,
        }),
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

    const content: Array<LanguageModelV2Content> = [];
    const logprobs: Array<z.infer<typeof LOGPROBS_SCHEMA>> = [];

    // map response content to content array
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
              options.providerOptions?.openai?.logprobs &&
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

            for (const annotation of contentPart.annotations) {
              if (annotation.type === 'url_citation') {
                content.push({
                  type: 'source',
                  sourceType: 'url',
                  id: this.config.generateId?.() ?? generateId(),
                  url: annotation.url,
                  title: annotation.title,
                });
              } else if (annotation.type === 'file_citation') {
                content.push({
                  type: 'source',
                  sourceType: 'document',
                  id: this.config.generateId?.() ?? generateId(),
                  mediaType: 'text/plain',
                  title: annotation.quote,
                  filename: annotation.file_id,
                });
              }
            }
          }

          break;
        }

        case 'function_call': {
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

        case 'web_search_call': {
          content.push({
            type: 'tool-call',
            toolCallId: part.id,
            toolName: 'web_search_preview',
            input: '',
            providerExecuted: true,
          });

          content.push({
            type: 'tool-result',
            toolCallId: part.id,
            toolName: 'web_search_preview',
            result: { status: part.status || 'completed' },
            providerExecuted: true,
          });
          break;
        }

        case 'computer_call': {
          content.push({
            type: 'tool-call',
            toolCallId: part.id,
            toolName: 'computer_use',
            input: '',
            providerExecuted: true,
          });

          content.push({
            type: 'tool-result',
            toolCallId: part.id,
            toolName: 'computer_use',
            result: {
              type: 'computer_use_tool_result',
              status: part.status || 'completed',
            },
            providerExecuted: true,
          });
          break;
        }

        case 'file_search_call': {
          content.push({
            type: 'tool-call',
            toolCallId: part.id,
            toolName: 'file_search',
            input: '',
            providerExecuted: true,
          });

          content.push({
            type: 'tool-result',
            toolCallId: part.id,
            toolName: 'file_search',
            result: {
              type: 'file_search_tool_result',
              status: part.status || 'completed',
              ...(part.queries && { queries: part.queries }),
              ...(part.results && { results: part.results }),
            },
            providerExecuted: true,
          });
          break;
        }
      }
    }

    const providerMetadata: SharedV2ProviderMetadata = {
      openai: { responseId: response.id },
    };

    if (logprobs.length > 0) {
      providerMetadata.openai.logprobs = logprobs;
    }

    return {
      content,
      finishReason: mapOpenAIResponseFinishReason({
        finishReason: response.incomplete_details?.reason,
        hasToolCalls: content.some(part => part.type === 'tool-call'),
      }),
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        totalTokens: response.usage.input_tokens + response.usage.output_tokens,
        reasoningTokens:
          response.usage.output_tokens_details?.reasoning_tokens ?? undefined,
        cachedInputTokens:
          response.usage.input_tokens_details?.cached_tokens ?? undefined,
      },
      request: { body },
      response: {
        id: response.id,
        timestamp: new Date(response.created_at * 1000),
        modelId: response.model,
        headers: responseHeaders,
        body: rawResponse,
      },
      providerMetadata,
      warnings,
    };
  }

  async doStream(
    options: Parameters<LanguageModelV2['doStream']>[0],
  ): Promise<Awaited<ReturnType<LanguageModelV2['doStream']>>> {
    const { args: body, warnings } = await this.getArgs(options);

    const { responseHeaders, value: response } = await postJsonToApi({
      url: this.config.url({
        path: '/responses',
        modelId: this.modelId,
      }),
      headers: combineHeaders(this.config.headers(), options.headers),
      body: {
        ...body,
        stream: true,
      },
      failedResponseHandler: openaiFailedResponseHandler,
      successfulResponseHandler: createEventSourceResponseHandler(
        openaiResponsesChunkSchema,
      ),
      abortSignal: options.abortSignal,
      fetch: this.config.fetch,
    });

    const self = this;

    let finishReason: LanguageModelV2FinishReason = 'unknown';
    const usage: LanguageModelV2Usage = {
      inputTokens: undefined,
      outputTokens: undefined,
      totalTokens: undefined,
    };
    const logprobs: Array<z.infer<typeof LOGPROBS_SCHEMA>> = [];
    let responseId: string | null = null;
    const ongoingToolCalls: Record<
      number,
      { toolName: string; toolCallId: string } | undefined
    > = {};
    let hasToolCalls = false;

    const activeReasoning: Record<
      string,
      {
        encryptedContent?: string | null;
        summaryParts: number[];
      }
    > = {};

    return {
      stream: response.pipeThrough(
        new TransformStream<
          ParseResult<z.infer<typeof openaiResponsesChunkSchema>>,
          LanguageModelV2StreamPart
        >({
          start(controller) {
            controller.enqueue({ type: 'stream-start', warnings });
          },

          transform(chunk, controller) {
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
              } else if (value.item.type === 'web_search_call') {
                ongoingToolCalls[value.output_index] = {
                  toolName: 'web_search_preview',
                  toolCallId: value.item.id,
                };

                controller.enqueue({
                  type: 'tool-input-start',
                  id: value.item.id,
                  toolName: 'web_search_preview',
                });
              } else if (value.item.type === 'computer_call') {
                ongoingToolCalls[value.output_index] = {
                  toolName: 'computer_use',
                  toolCallId: value.item.id,
                };

                controller.enqueue({
                  type: 'tool-input-start',
                  id: value.item.id,
                  toolName: 'computer_use',
                });
              } else if (value.item.type === 'file_search_call') {
                ongoingToolCalls[value.output_index] = {
                  toolName: 'file_search',
                  toolCallId: value.item.id,
                };

                controller.enqueue({
                  type: 'tool-input-start',
                  id: value.item.id,
                  toolName: 'file_search',
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
              } else if (isResponseOutputItemAddedReasoningChunk(value)) {
                activeReasoning[value.item.id] = {
                  encryptedContent: value.item.encrypted_content,
                  summaryParts: [0],
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
                hasToolCalls = true;

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
                    openai: {
                      itemId: value.item.id,
                    },
                  },
                });
              } else if (value.item.type === 'web_search_call') {
                ongoingToolCalls[value.output_index] = undefined;
                hasToolCalls = true;

                controller.enqueue({
                  type: 'tool-input-end',
                  id: value.item.id,
                });

                controller.enqueue({
                  type: 'tool-call',
                  toolCallId: value.item.id,
                  toolName: 'web_search_preview',
                  input: '',
                  providerExecuted: true,
                });

                controller.enqueue({
                  type: 'tool-result',
                  toolCallId: value.item.id,
                  toolName: 'web_search_preview',
                  result: {
                    type: 'web_search_tool_result',
                    status: value.item.status || 'completed',
                  },
                  providerExecuted: true,
                });
              } else if (value.item.type === 'computer_call') {
                ongoingToolCalls[value.output_index] = undefined;
                hasToolCalls = true;

                controller.enqueue({
                  type: 'tool-input-end',
                  id: value.item.id,
                });

                controller.enqueue({
                  type: 'tool-call',
                  toolCallId: value.item.id,
                  toolName: 'computer_use',
                  input: '',
                  providerExecuted: true,
                });

                controller.enqueue({
                  type: 'tool-result',
                  toolCallId: value.item.id,
                  toolName: 'computer_use',
                  result: {
                    type: 'computer_use_tool_result',
                    status: value.item.status || 'completed',
                  },
                  providerExecuted: true,
                });
              } else if (value.item.type === 'file_search_call') {
                ongoingToolCalls[value.output_index] = undefined;
                hasToolCalls = true;

                controller.enqueue({
                  type: 'tool-input-end',
                  id: value.item.id,
                });

                controller.enqueue({
                  type: 'tool-call',
                  toolCallId: value.item.id,
                  toolName: 'file_search',
                  input: '',
                  providerExecuted: true,
                });

                controller.enqueue({
                  type: 'tool-result',
                  toolCallId: value.item.id,
                  toolName: 'file_search',
                  result: {
                    type: 'file_search_tool_result',
                    status: value.item.status || 'completed',
                    ...(value.item.queries && { queries: value.item.queries }),
                    ...(value.item.results && { results: value.item.results }),
                  },
                  providerExecuted: true,
                });
              } else if (value.item.type === 'message') {
                controller.enqueue({
                  type: 'text-end',
                  id: value.item.id,
                });
              } else if (isResponseOutputItemDoneReasoningChunk(value)) {
                const activeReasoningPart = activeReasoning[value.item.id];

                for (const summaryIndex of activeReasoningPart.summaryParts) {
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

              if (value.logprobs) {
                logprobs.push(value.logprobs);
              }
            } else if (isResponseReasoningSummaryPartAddedChunk(value)) {
              // the first reasoning start is pushed in isResponseOutputItemAddedReasoningChunk.
              if (value.summary_index > 0) {
                activeReasoning[value.item_id]?.summaryParts.push(
                  value.summary_index,
                );

                controller.enqueue({
                  type: 'reasoning-start',
                  id: `${value.item_id}:${value.summary_index}`,
                  providerMetadata: {
                    openai: {
                      itemId: value.item_id,
                      reasoningEncryptedContent:
                        activeReasoning[value.item_id]?.encryptedContent ??
                        null,
                    },
                  },
                });
              }
            } else if (isResponseReasoningSummaryTextDeltaChunk(value)) {
              controller.enqueue({
                type: 'reasoning-delta',
                id: `${value.item_id}:${value.summary_index}`,
                delta: value.delta,
                providerMetadata: {
                  openai: {
                    itemId: value.item_id,
                  },
                },
              });
            } else if (isResponseFinishedChunk(value)) {
              finishReason = mapOpenAIResponseFinishReason({
                finishReason: value.response.incomplete_details?.reason,
                hasToolCalls,
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
            } else if (isResponseAnnotationAddedChunk(value)) {
              if (value.annotation.type === 'url_citation') {
                controller.enqueue({
                  type: 'source',
                  sourceType: 'url',
                  id: self.config.generateId?.() ?? generateId(),
                  url: value.annotation.url,
                  title: value.annotation.title,
                });
              } else if (value.annotation.type === 'file_citation') {
                controller.enqueue({
                  type: 'source',
                  sourceType: 'document',
                  id: self.config.generateId?.() ?? generateId(),
                  mediaType: 'text/plain',
                  title: value.annotation.quote,
                  filename: value.annotation.file_id,
                });
              }
            } else if (isErrorChunk(value)) {
              controller.enqueue({ type: 'error', error: value });
            }
          },

          flush(controller) {
            const providerMetadata: SharedV2ProviderMetadata = {
              openai: {
                responseId,
              },
            };

            if (logprobs.length > 0) {
              providerMetadata.openai.logprobs = logprobs;
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

const usageSchema = z.object({
  input_tokens: z.number(),
  input_tokens_details: z
    .object({ cached_tokens: z.number().nullish() })
    .nullish(),
  output_tokens: z.number(),
  output_tokens_details: z
    .object({ reasoning_tokens: z.number().nullish() })
    .nullish(),
});

const textDeltaChunkSchema = z.object({
  type: z.literal('response.output_text.delta'),
  item_id: z.string(),
  delta: z.string(),
  logprobs: LOGPROBS_SCHEMA.nullish(),
});

const errorChunkSchema = z.object({
  type: z.literal('error'),
  code: z.string(),
  message: z.string(),
  param: z.string().nullish(),
  sequence_number: z.number(),
});

const responseFinishedChunkSchema = z.object({
  type: z.enum(['response.completed', 'response.incomplete']),
  response: z.object({
    incomplete_details: z.object({ reason: z.string() }).nullish(),
    usage: usageSchema,
  }),
});

const responseCreatedChunkSchema = z.object({
  type: z.literal('response.created'),
  response: z.object({
    id: z.string(),
    created_at: z.number(),
    model: z.string(),
  }),
});

const responseOutputItemAddedSchema = z.object({
  type: z.literal('response.output_item.added'),
  output_index: z.number(),
  item: z.discriminatedUnion('type', [
    z.object({
      type: z.literal('message'),
      id: z.string(),
    }),
    z.object({
      type: z.literal('reasoning'),
      id: z.string(),
      encrypted_content: z.string().nullish(),
    }),
    z.object({
      type: z.literal('function_call'),
      id: z.string(),
      call_id: z.string(),
      name: z.string(),
      arguments: z.string(),
    }),
    z.object({
      type: z.literal('web_search_call'),
      id: z.string(),
      status: z.string(),
    }),
    z.object({
      type: z.literal('computer_call'),
      id: z.string(),
      status: z.string(),
    }),
    z.object({
      type: z.literal('file_search_call'),
      id: z.string(),
      status: z.string(),
      queries: z.array(z.string()).nullish(),
      results: z
        .array(
          z.object({
            attributes: z.object({
              file_id: z.string(),
              filename: z.string(),
              score: z.number(),
              text: z.string(),
            }),
          }),
        )
        .optional(),
    }),
  ]),
});

const responseOutputItemDoneSchema = z.object({
  type: z.literal('response.output_item.done'),
  output_index: z.number(),
  item: z.discriminatedUnion('type', [
    z.object({
      type: z.literal('message'),
      id: z.string(),
    }),
    z.object({
      type: z.literal('reasoning'),
      id: z.string(),
      encrypted_content: z.string().nullish(),
    }),
    z.object({
      type: z.literal('function_call'),
      id: z.string(),
      call_id: z.string(),
      name: z.string(),
      arguments: z.string(),
      status: z.literal('completed'),
    }),
    z.object({
      type: z.literal('web_search_call'),
      id: z.string(),
      status: z.literal('completed'),
    }),
    z.object({
      type: z.literal('computer_call'),
      id: z.string(),
      status: z.literal('completed'),
    }),
    z.object({
      type: z.literal('file_search_call'),
      id: z.string(),
      status: z.literal('completed'),
      queries: z.array(z.string()).nullish(),
      results: z
        .array(
          z.object({
            attributes: z.object({
              file_id: z.string(),
              filename: z.string(),
              score: z.number(),
              text: z.string(),
            }),
          }),
        )
        .nullish(),
    }),
  ]),
});

const responseFunctionCallArgumentsDeltaSchema = z.object({
  type: z.literal('response.function_call_arguments.delta'),
  item_id: z.string(),
  output_index: z.number(),
  delta: z.string(),
});

const responseAnnotationAddedSchema = z.object({
  type: z.literal('response.output_text.annotation.added'),
  annotation: z.discriminatedUnion('type', [
    z.object({
      type: z.literal('url_citation'),
      url: z.string(),
      title: z.string(),
    }),
    z.object({
      type: z.literal('file_citation'),
      file_id: z.string(),
      quote: z.string(),
    }),
  ]),
});

const responseReasoningSummaryPartAddedSchema = z.object({
  type: z.literal('response.reasoning_summary_part.added'),
  item_id: z.string(),
  summary_index: z.number(),
});

const responseReasoningSummaryTextDeltaSchema = z.object({
  type: z.literal('response.reasoning_summary_text.delta'),
  item_id: z.string(),
  summary_index: z.number(),
  delta: z.string(),
});

const openaiResponsesChunkSchema = z.union([
  textDeltaChunkSchema,
  responseFinishedChunkSchema,
  responseCreatedChunkSchema,
  responseOutputItemAddedSchema,
  responseOutputItemDoneSchema,
  responseFunctionCallArgumentsDeltaSchema,
  responseAnnotationAddedSchema,
  responseReasoningSummaryPartAddedSchema,
  responseReasoningSummaryTextDeltaSchema,
  errorChunkSchema,
  z.object({ type: z.string() }).loose(), // fallback for unknown chunks
]);

type ExtractByType<
  T,
  K extends T extends { type: infer U } ? U : never,
> = T extends { type: K } ? T : never;

function isTextDeltaChunk(
  chunk: z.infer<typeof openaiResponsesChunkSchema>,
): chunk is z.infer<typeof textDeltaChunkSchema> {
  return chunk.type === 'response.output_text.delta';
}

function isResponseOutputItemDoneChunk(
  chunk: z.infer<typeof openaiResponsesChunkSchema>,
): chunk is z.infer<typeof responseOutputItemDoneSchema> {
  return chunk.type === 'response.output_item.done';
}

function isResponseOutputItemDoneReasoningChunk(
  chunk: z.infer<typeof openaiResponsesChunkSchema>,
): chunk is z.infer<typeof responseOutputItemDoneSchema> & {
  item: ExtractByType<
    z.infer<typeof responseOutputItemDoneSchema>['item'],
    'reasoning'
  >;
} {
  return (
    isResponseOutputItemDoneChunk(chunk) && chunk.item.type === 'reasoning'
  );
}

function isResponseFinishedChunk(
  chunk: z.infer<typeof openaiResponsesChunkSchema>,
): chunk is z.infer<typeof responseFinishedChunkSchema> {
  return (
    chunk.type === 'response.completed' || chunk.type === 'response.incomplete'
  );
}

function isResponseCreatedChunk(
  chunk: z.infer<typeof openaiResponsesChunkSchema>,
): chunk is z.infer<typeof responseCreatedChunkSchema> {
  return chunk.type === 'response.created';
}

function isResponseFunctionCallArgumentsDeltaChunk(
  chunk: z.infer<typeof openaiResponsesChunkSchema>,
): chunk is z.infer<typeof responseFunctionCallArgumentsDeltaSchema> {
  return chunk.type === 'response.function_call_arguments.delta';
}

function isResponseOutputItemAddedChunk(
  chunk: z.infer<typeof openaiResponsesChunkSchema>,
): chunk is z.infer<typeof responseOutputItemAddedSchema> {
  return chunk.type === 'response.output_item.added';
}

function isResponseOutputItemAddedReasoningChunk(
  chunk: z.infer<typeof openaiResponsesChunkSchema>,
): chunk is z.infer<typeof responseOutputItemAddedSchema> & {
  item: ExtractByType<
    z.infer<typeof responseOutputItemAddedSchema>['item'],
    'reasoning'
  >;
} {
  return (
    isResponseOutputItemAddedChunk(chunk) && chunk.item.type === 'reasoning'
  );
}

function isResponseAnnotationAddedChunk(
  chunk: z.infer<typeof openaiResponsesChunkSchema>,
): chunk is z.infer<typeof responseAnnotationAddedSchema> {
  return chunk.type === 'response.output_text.annotation.added';
}

function isResponseReasoningSummaryPartAddedChunk(
  chunk: z.infer<typeof openaiResponsesChunkSchema>,
): chunk is z.infer<typeof responseReasoningSummaryPartAddedSchema> {
  return chunk.type === 'response.reasoning_summary_part.added';
}

function isResponseReasoningSummaryTextDeltaChunk(
  chunk: z.infer<typeof openaiResponsesChunkSchema>,
): chunk is z.infer<typeof responseReasoningSummaryTextDeltaSchema> {
  return chunk.type === 'response.reasoning_summary_text.delta';
}

function isErrorChunk(
  chunk: z.infer<typeof openaiResponsesChunkSchema>,
): chunk is z.infer<typeof errorChunkSchema> {
  return chunk.type === 'error';
}

type ResponsesModelConfig = {
  isReasoningModel: boolean;
  systemMessageMode: 'remove' | 'system' | 'developer';
  requiredAutoTruncation: boolean;
};

function getResponsesModelConfig(modelId: string): ResponsesModelConfig {
  // gpt-5-chat models are non-reasoning
  if (modelId.startsWith('gpt-5-chat')) {
    return {
      isReasoningModel: false,
      systemMessageMode: 'system',
      requiredAutoTruncation: false,
    };
  }

  // o series reasoning models:
  if (
    modelId.startsWith('o') ||
    modelId.startsWith('gpt-5') ||
    modelId.startsWith('codex-') ||
    modelId.startsWith('computer-use')
  ) {
    if (modelId.startsWith('o1-mini') || modelId.startsWith('o1-preview')) {
      return {
        isReasoningModel: true,
        systemMessageMode: 'remove',
        requiredAutoTruncation: false,
      };
    }

    return {
      isReasoningModel: true,
      systemMessageMode: 'developer',
      requiredAutoTruncation: false,
    };
  }

  // gpt models:
  return {
    isReasoningModel: false,
    systemMessageMode: 'system',
    requiredAutoTruncation: false,
  };
}

function supportsFlexProcessing(modelId: string): boolean {
  return (
    modelId.startsWith('o3') ||
    modelId.startsWith('o4-mini') ||
    (modelId.startsWith('gpt-5') && !modelId.startsWith('gpt-5-chat'))
  );
}

function supportsPriorityProcessing(modelId: string): boolean {
  return (
    modelId.startsWith('gpt-4') ||
    modelId.startsWith('gpt-5-mini') ||
    (modelId.startsWith('gpt-5') &&
      !modelId.startsWith('gpt-5-nano') &&
      !modelId.startsWith('gpt-5-chat')) ||
    modelId.startsWith('o3') ||
    modelId.startsWith('o4-mini')
  );
}

// TODO AI SDK 6: use optional here instead of nullish
const openaiResponsesProviderOptionsSchema = z.object({
  metadata: z.any().nullish(),
  parallelToolCalls: z.boolean().nullish(),
  previousResponseId: z.string().nullish(),
  store: z.boolean().nullish(),
  user: z.string().nullish(),
  reasoningEffort: z.string().nullish(),
  strictJsonSchema: z.boolean().nullish(),
  instructions: z.string().nullish(),
  reasoningSummary: z.string().nullish(),
  serviceTier: z.enum(['auto', 'flex', 'priority']).nullish(),
  include: z
    .array(
      z.enum([
        'reasoning.encrypted_content',
        'file_search_call.results',
        'message.output_text.logprobs',
      ]),
    )
    .nullish(),
  textVerbosity: z.enum(['low', 'medium', 'high']).nullish(),
  promptCacheKey: z.string().nullish(),
  safetyIdentifier: z.string().nullish(),

  /**
   * Return the log probabilities of the tokens.
   *
   * Setting to true will return the log probabilities of the tokens that
   * were generated.
   *
   * Setting to a number will return the log probabilities of the top n
   * tokens that were generated.
   *
   * @see https://platform.openai.com/docs/api-reference/responses/create
   * @see https://cookbook.openai.com/examples/using_logprobs
   */
  logprobs: z
    .union([z.boolean(), z.number().min(1).max(TOP_LOGPROBS_MAX)])
    .optional(),
});

export type OpenAIResponsesProviderOptions = z.infer<
  typeof openaiResponsesProviderOptionsSchema
>;
