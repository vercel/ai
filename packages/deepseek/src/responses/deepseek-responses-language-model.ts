import type {
  LanguageModelV4,
  LanguageModelV4CallOptions,
  LanguageModelV4Content,
  LanguageModelV4FinishReason,
  LanguageModelV4GenerateResult,
  LanguageModelV4StreamPart,
  LanguageModelV4StreamResult,
  SharedV4Warning,
} from '@ai-sdk/provider';
import {
  combineHeaders,
  createEventSourceResponseHandler,
  createJsonErrorResponseHandler,
  createJsonResponseHandler,
  createLanguageModelResponseMetadata,
  isCustomReasoning,
  mapReasoningToProviderEffort,
  parseProviderOptions,
  postJsonToApi,
  serializeModelOptions,
  WORKFLOW_DESERIALIZE,
  WORKFLOW_SERIALIZE,
  type FetchFunction,
  type InferSchema,
  type ParseResult,
} from '@ai-sdk/provider-utils';
import { deepSeekErrorSchema } from '../chat/deepseek-chat-api-types';
import { convertDeepSeekResponsesUsage } from './convert-deepseek-responses-usage';
import { convertToDeepSeekResponsesInput } from './convert-to-deepseek-responses-input';
import {
  deepseekResponsesChunkSchema,
  deepseekResponsesResponseSchema,
  type DeepSeekResponsesUsage,
} from './deepseek-responses-api';
import {
  deepseekLanguageModelResponsesOptions,
  type DeepSeekResponsesModelId,
} from './deepseek-responses-language-model-options';
import { prepareResponsesTools } from './deepseek-responses-prepare-tools';
import { mapDeepSeekResponsesFinishReason } from './map-deepseek-responses-finish-reason';

export type DeepSeekResponsesConfig = {
  provider: string;
  headers?: () => Record<string, string | undefined>;
  url: (options: { modelId: string; path: string }) => string;
  fetch?: FetchFunction;
};

const failedResponseHandler = createJsonErrorResponseHandler({
  errorSchema: deepSeekErrorSchema,
  errorToMessage: (error: InferSchema<typeof deepSeekErrorSchema>) =>
    error.error.message,
});

export class DeepSeekResponsesLanguageModel implements LanguageModelV4 {
  readonly specificationVersion = 'v4';

  readonly modelId: DeepSeekResponsesModelId;
  readonly supportedUrls = {};

  private readonly config: DeepSeekResponsesConfig;

  static [WORKFLOW_SERIALIZE](model: DeepSeekResponsesLanguageModel) {
    return serializeModelOptions({
      modelId: model.modelId,
      config: model.config,
    });
  }

  static [WORKFLOW_DESERIALIZE](options: {
    modelId: DeepSeekResponsesModelId;
    config: DeepSeekResponsesConfig;
  }) {
    return new DeepSeekResponsesLanguageModel(options.modelId, options.config);
  }

  constructor(
    modelId: DeepSeekResponsesModelId,
    config: DeepSeekResponsesConfig,
  ) {
    this.modelId = modelId;
    this.config = config;
  }

  get provider(): string {
    return this.config.provider;
  }

  private get providerOptionsName(): string {
    return this.config.provider.split('.')[0].trim();
  }

  private async getArgs({
    frequencyPenalty,
    maxOutputTokens,
    presencePenalty,
    prompt,
    providerOptions,
    reasoning,
    responseFormat,
    seed,
    stopSequences,
    temperature,
    toolChoice,
    tools,
    topK,
    topP,
  }: LanguageModelV4CallOptions) {
    const warnings: Array<SharedV4Warning> = [];

    if (topK != null) {
      warnings.push({ type: 'unsupported', feature: 'topK' });
    }

    if (seed != null) {
      warnings.push({ type: 'unsupported', feature: 'seed' });
    }

    if (presencePenalty != null) {
      warnings.push({ type: 'unsupported', feature: 'presencePenalty' });
    }

    if (frequencyPenalty != null) {
      warnings.push({ type: 'unsupported', feature: 'frequencyPenalty' });
    }

    if (stopSequences != null) {
      warnings.push({ type: 'unsupported', feature: 'stopSequences' });
    }

    const deepseekOptions =
      (await parseProviderOptions({
        provider: this.providerOptionsName,
        providerOptions,
        schema: deepseekLanguageModelResponsesOptions,
      })) ?? {};

    const {
      input,
      instructions,
      warnings: inputWarnings,
    } = convertToDeepSeekResponsesInput({
      prompt,
      providerOptionsName: this.providerOptionsName,
    });

    warnings.push(...inputWarnings);

    const {
      tools: deepseekTools,
      toolChoice: deepseekToolChoice,
      toolWarnings,
    } = prepareResponsesTools({ tools, toolChoice });

    warnings.push(...toolWarnings);

    const reasoningEffort =
      deepseekOptions.reasoningEffort ??
      (isCustomReasoning(reasoning)
        ? reasoning === 'none'
          ? 'none'
          : mapReasoningToProviderEffort({
              reasoning,
              // DeepSeek V4 has three thinking strengths: low, high and max.
              effortMap: {
                minimal: 'low',
                low: 'low',
                medium: 'high',
                high: 'high',
                xhigh: 'max',
              },
              warnings,
            })
        : undefined);

    return {
      args: {
        model: this.modelId,
        input,
        instructions,
        max_output_tokens: maxOutputTokens,
        temperature,
        top_p: topP,
        tools: deepseekTools,
        tool_choice: deepseekToolChoice,
        user: deepseekOptions.user,
        ...(reasoningEffort != null && {
          reasoning: { effort: reasoningEffort },
        }),
        ...(responseFormat?.type === 'json' && {
          text: {
            format:
              responseFormat.schema == null
                ? { type: 'json_object' as const }
                : {
                    type: 'json_schema' as const,
                    name: responseFormat.name ?? 'response',
                    description: responseFormat.description,
                    schema: responseFormat.schema,
                    strict: deepseekOptions.strictJsonSchema ?? true,
                  },
          },
        }),
      },
      warnings,
    };
  }

  async doGenerate(
    options: LanguageModelV4CallOptions,
  ): Promise<LanguageModelV4GenerateResult> {
    const { args, warnings } = await this.getArgs(options);
    const providerOptionsName = this.providerOptionsName;

    const {
      responseHeaders,
      value: response,
      rawValue: rawResponse,
    } = await postJsonToApi({
      url: this.config.url({ path: '/responses', modelId: this.modelId }),
      headers: combineHeaders(this.config.headers?.(), options.headers),
      body: args,
      failedResponseHandler,
      successfulResponseHandler: createJsonResponseHandler(
        deepseekResponsesResponseSchema,
      ),
      abortSignal: options.abortSignal,
      fetch: this.config.fetch,
    });

    const content: Array<LanguageModelV4Content> = [];
    let hasToolCalls = false;

    for (const part of response.output ?? []) {
      switch (part.type) {
        case 'reasoning': {
          for (const contentPart of part.content ?? []) {
            content.push({
              type: 'reasoning',
              text: contentPart.text,
              providerMetadata: {
                [providerOptionsName]: { itemId: part.id ?? null },
              },
            });
          }
          break;
        }

        case 'function_call': {
          hasToolCalls = true;
          content.push({
            type: 'tool-call',
            toolCallId: part.call_id,
            toolName: part.name,
            input: part.arguments,
            providerMetadata: {
              [providerOptionsName]: { itemId: part.id ?? null },
            },
          });
          break;
        }

        case 'message': {
          for (const contentPart of part.content) {
            content.push({ type: 'text', text: contentPart.text });
          }
          break;
        }
      }
    }

    return {
      content,
      finishReason: {
        unified: mapDeepSeekResponsesFinishReason({
          incompleteReason: response.incomplete_details?.reason,
          hasToolCalls,
        }),
        raw: response.incomplete_details?.reason ?? undefined,
      },
      usage: convertDeepSeekResponsesUsage(response.usage),
      providerMetadata: {
        [providerOptionsName]: getCacheMetadata(response.usage),
      },
      request: { body: args },
      response: {
        ...createLanguageModelResponseMetadata({
          id: response.id,
          created: response.created_at,
          model: response.model,
        }),
        headers: responseHeaders,
        body: rawResponse,
      },
      warnings,
    };
  }

  async doStream(
    options: LanguageModelV4CallOptions,
  ): Promise<LanguageModelV4StreamResult> {
    const { args, warnings } = await this.getArgs(options);
    const body = { ...args, stream: true };
    const providerOptionsName = this.providerOptionsName;

    const { responseHeaders, value: response } = await postJsonToApi({
      url: this.config.url({ path: '/responses', modelId: this.modelId }),
      headers: combineHeaders(this.config.headers?.(), options.headers),
      body,
      failedResponseHandler,
      successfulResponseHandler: createEventSourceResponseHandler(
        deepseekResponsesChunkSchema,
      ),
      abortSignal: options.abortSignal,
      fetch: this.config.fetch,
    });

    let finishReason: LanguageModelV4FinishReason = {
      unified: 'other',
      raw: undefined,
    };
    let usage: DeepSeekResponsesUsage;
    let hasToolCalls = false;

    return {
      stream: response.pipeThrough(
        new TransformStream<
          ParseResult<InferSchema<typeof deepseekResponsesChunkSchema>>,
          LanguageModelV4StreamPart
        >({
          start(controller) {
            controller.enqueue({ type: 'stream-start', warnings });
          },

          transform(chunk, controller) {
            if (options.includeRawChunks) {
              controller.enqueue({ type: 'raw', rawValue: chunk.rawValue });
            }

            if (!chunk.success) {
              finishReason = { unified: 'error', raw: undefined };
              controller.enqueue({ type: 'error', error: chunk.error });
              return;
            }

            const value = chunk.value;

            switch (value.type) {
              case 'response.created': {
                controller.enqueue({
                  type: 'response-metadata',
                  ...createLanguageModelResponseMetadata({
                    id: value.response.id,
                    created: value.response.created_at,
                    model: value.response.model,
                  }),
                });
                break;
              }

              case 'response.output_item.added': {
                switch (value.item.type) {
                  case 'reasoning': {
                    controller.enqueue({
                      type: 'reasoning-start',
                      id: value.item.id ?? `${value.output_index}`,
                    });
                    break;
                  }
                  case 'message': {
                    controller.enqueue({
                      type: 'text-start',
                      id: value.item.id ?? `${value.output_index}`,
                    });
                    break;
                  }
                  case 'function_call': {
                    controller.enqueue({
                      type: 'tool-input-start',
                      id: value.item.id ?? value.item.call_id,
                      toolName: value.item.name,
                    });
                    break;
                  }
                }
                break;
              }

              case 'response.reasoning_text.delta': {
                controller.enqueue({
                  type: 'reasoning-delta',
                  id: value.item_id,
                  delta: value.delta,
                });
                break;
              }

              case 'response.output_text.delta': {
                controller.enqueue({
                  type: 'text-delta',
                  id: value.item_id,
                  delta: value.delta,
                });
                break;
              }

              case 'response.function_call_arguments.delta': {
                controller.enqueue({
                  type: 'tool-input-delta',
                  id: value.item_id,
                  delta: value.delta,
                });
                break;
              }

              case 'response.output_item.done': {
                switch (value.item.type) {
                  case 'reasoning': {
                    controller.enqueue({
                      type: 'reasoning-end',
                      id: value.item.id ?? `${value.output_index}`,
                      providerMetadata: {
                        [providerOptionsName]: {
                          itemId: value.item.id ?? null,
                        },
                      },
                    });
                    break;
                  }
                  case 'message': {
                    controller.enqueue({
                      type: 'text-end',
                      id: value.item.id ?? `${value.output_index}`,
                    });
                    break;
                  }
                  case 'function_call': {
                    hasToolCalls = true;

                    controller.enqueue({
                      type: 'tool-input-end',
                      id: value.item.id ?? value.item.call_id,
                    });

                    controller.enqueue({
                      type: 'tool-call',
                      toolCallId: value.item.call_id,
                      toolName: value.item.name,
                      input: value.item.arguments,
                      providerMetadata: {
                        [providerOptionsName]: {
                          itemId: value.item.id ?? null,
                        },
                      },
                    });
                    break;
                  }
                }
                break;
              }

              case 'response.completed':
              case 'response.incomplete': {
                usage = value.response.usage;
                finishReason = {
                  unified: mapDeepSeekResponsesFinishReason({
                    incompleteReason: value.response.incomplete_details?.reason,
                    hasToolCalls,
                  }),
                  raw: value.response.incomplete_details?.reason ?? undefined,
                };
                break;
              }

              case 'response.failed': {
                usage = value.response.usage;
                finishReason = {
                  unified: 'error',
                  raw: value.response.error?.code ?? undefined,
                };
                controller.enqueue({
                  type: 'error',
                  error:
                    value.response.error?.message ??
                    'DeepSeek Responses API returned a failed response.',
                });
                break;
              }
            }
          },

          flush(controller) {
            controller.enqueue({
              type: 'finish',
              finishReason,
              usage: convertDeepSeekResponsesUsage(usage),
              providerMetadata: {
                [providerOptionsName]: getCacheMetadata(usage),
              },
            });
          },
        }),
      ),
      request: { body },
      response: { headers: responseHeaders },
    };
  }
}

/**
 * Exposes DeepSeek's context cache hit/miss counts under the same keys the
 * chat completions model uses, derived from the Responses API usage shape.
 *
 * @see https://api-docs.deepseek.com/guides/kv_cache
 */
function getCacheMetadata(usage: DeepSeekResponsesUsage) {
  if (usage == null) {
    return {
      promptCacheHitTokens: undefined,
      promptCacheMissTokens: undefined,
    };
  }

  const inputTokens = usage.input_tokens ?? undefined;
  const cacheHitTokens = usage.input_tokens_details?.cached_tokens ?? undefined;

  return {
    promptCacheHitTokens: cacheHitTokens,
    promptCacheMissTokens:
      inputTokens != null && cacheHitTokens != null
        ? inputTokens - cacheHitTokens
        : undefined,
  };
}
