import {
  APICallError,
  type LanguageModelV4,
  type LanguageModelV4CallOptions,
  type LanguageModelV4Content,
  type LanguageModelV4FinishReason,
  type LanguageModelV4GenerateResult,
  type LanguageModelV4StreamPart,
  type LanguageModelV4StreamResult,
  type SharedV4ProviderMetadata,
  type SharedV4Warning,
} from '@ai-sdk/provider';
import {
  combineHeaders,
  createEventSourceResponseHandler,
  createJsonErrorResponseHandler,
  createJsonResponseHandler,
  createLanguageModelResponseMetadata,
  isCustomReasoning,
  parseProviderOptions,
  postJsonToApi,
  serializeModelOptions,
  WORKFLOW_DESERIALIZE,
  WORKFLOW_SERIALIZE,
  type FetchFunction,
  type ParseResult,
} from '@ai-sdk/provider-utils';
import type { z } from 'zod/v4';
import { convertPerplexityUsage } from './convert-perplexity-usage';
import { convertToPerplexityInput } from './convert-to-perplexity-input';
import { mapPerplexityFinishReason } from './map-perplexity-finish-reason';
import {
  perplexityAgentChunkSchema,
  perplexityAgentResponseSchema,
  perplexityErrorSchema,
  perplexityErrorToMessage,
  type PerplexityAgentTool,
  type perplexityOutputItemSchema,
  type perplexitySearchResultSchema,
  type perplexityUsageSchema,
} from './perplexity-agent-api';
import { perplexityLanguageModelOptions } from './perplexity-language-model-options';
import type {
  PerplexityAgentPreset,
  PerplexityLanguageModelId,
} from './perplexity-options';
import { preparePerplexityTools } from './perplexity-prepare-tools';

type PerplexityAgentConfig = {
  baseURL: string;
  headers?: () => Record<string, string | undefined>;
  generateId: () => string;
  fetch?: FetchFunction;
};

type PerplexityOutputItem = z.infer<typeof perplexityOutputItemSchema>;
type PerplexitySearchResult = z.infer<typeof perplexitySearchResultSchema>;
type PerplexityUsage = z.infer<typeof perplexityUsageSchema>;
type PerplexityUrlSource = Extract<
  LanguageModelV4Content,
  { type: 'source'; sourceType: 'url' }
>;

const presetIds = new Set<PerplexityAgentPreset>([
  'fast',
  'low',
  'medium',
  'high',
  'xhigh',
]);

function getModelSelection(modelId: PerplexityLanguageModelId): {
  model?: string;
  preset?: PerplexityAgentPreset;
} {
  if (presetIds.has(modelId as PerplexityAgentPreset)) {
    return { preset: modelId as PerplexityAgentPreset };
  }

  return { model: modelId };
}

function getResponseMetadata(response: {
  id?: string | null;
  model?: string | null;
  created_at?: number | null;
}) {
  return createLanguageModelResponseMetadata({
    id: response.id,
    model: response.model,
    created: response.created_at,
  });
}

function getProviderMetadata(
  usage: PerplexityUsage | null | undefined,
): SharedV4ProviderMetadata {
  const cost = usage?.cost;
  const numSearchQueries = usage?.tool_calls_details
    ? Object.entries(usage.tool_calls_details)
        .filter(([name]) => name.includes('search'))
        .reduce((total, [, details]) => total + (details.invocation ?? 0), 0)
    : null;

  return {
    perplexity: {
      usage: {
        citationTokens: null,
        numSearchQueries,
      },
      images: null,
      cost:
        cost == null
          ? null
          : {
              inputTokensCost: cost.input_cost ?? null,
              outputTokensCost: cost.output_cost ?? null,
              requestCost: null,
              totalCost: cost.total_cost ?? null,
              currency: cost.currency ?? null,
              cacheCreationCost: cost.cache_creation_cost ?? null,
              cacheReadCost: cost.cache_read_cost ?? null,
              toolCallsCost: cost.tool_calls_cost ?? null,
            },
      toolCalls:
        usage?.tool_calls_details == null
          ? null
          : Object.fromEntries(
              Object.entries(usage.tool_calls_details).map(
                ([name, details]) => [
                  name,
                  { invocation: details.invocation ?? null },
                ],
              ),
            ),
    },
  };
}

function createSource(
  result: PerplexitySearchResult,
  generateId: () => string,
): PerplexityUrlSource {
  return {
    type: 'source',
    sourceType: 'url',
    id: result.id == null ? generateId() : String(result.id),
    url: result.url,
    title: result.title,
    providerMetadata: {
      perplexity: {
        resultId: result.id ?? null,
        snippet: result.snippet ?? null,
        date: result.date ?? null,
        lastUpdated: result.last_updated ?? null,
        source: result.source ?? null,
      },
    },
  };
}

function hasSearchResultId(source: PerplexityUrlSource): boolean {
  return typeof source.providerMetadata?.perplexity?.resultId === 'number';
}

function getSearchResults(item: PerplexityOutputItem) {
  return item.type === 'search_results' ? (item.results ?? []) : [];
}

function getFetchedSources(item: PerplexityOutputItem) {
  return item.type === 'fetch_url_results' ? (item.contents ?? []) : [];
}

export class PerplexityLanguageModel implements LanguageModelV4 {
  readonly specificationVersion = 'v4';
  readonly provider = 'perplexity';

  readonly modelId: PerplexityLanguageModelId;

  private readonly config: PerplexityAgentConfig;

  static [WORKFLOW_SERIALIZE](model: PerplexityLanguageModel) {
    return serializeModelOptions({
      modelId: model.modelId,
      config: model.config,
    });
  }

  static [WORKFLOW_DESERIALIZE](options: {
    modelId: PerplexityLanguageModelId;
    config: PerplexityAgentConfig;
  }) {
    return new PerplexityLanguageModel(options.modelId, options.config);
  }

  constructor(
    modelId: PerplexityLanguageModelId,
    config: PerplexityAgentConfig,
  ) {
    this.modelId = modelId;
    this.config = config;
  }

  readonly supportedUrls: Record<string, RegExp[]> = {
    'image/*': [/^https?:\/\/.*$/],
  };

  private async getArgs({
    prompt,
    maxOutputTokens,
    temperature,
    topP,
    topK,
    frequencyPenalty,
    presencePenalty,
    stopSequences,
    reasoning,
    responseFormat,
    seed,
    providerOptions,
    tools,
    toolChoice,
  }: LanguageModelV4CallOptions) {
    const warnings: SharedV4Warning[] = [];

    const perplexityOptions =
      (await parseProviderOptions({
        provider: 'perplexity',
        providerOptions,
        schema: perplexityLanguageModelOptions,
      })) ?? {};

    if (topK != null) {
      warnings.push({ type: 'unsupported', feature: 'topK' });
    }
    if (frequencyPenalty != null) {
      warnings.push({ type: 'unsupported', feature: 'frequencyPenalty' });
    }
    if (presencePenalty != null) {
      warnings.push({ type: 'unsupported', feature: 'presencePenalty' });
    }
    if (stopSequences != null) {
      warnings.push({ type: 'unsupported', feature: 'stopSequences' });
    }
    if (seed != null) {
      warnings.push({ type: 'unsupported', feature: 'seed' });
    }

    const { tools: nativeTools, ...agentOptions } = perplexityOptions;

    const modelSelection = getModelSelection(this.modelId);

    const { input, warnings: inputWarnings } = convertToPerplexityInput(prompt);
    warnings.push(...inputWarnings);

    const { tools: functionTools, warnings: toolWarnings } =
      preparePerplexityTools({ tools, toolChoice });
    warnings.push(...toolWarnings);

    const agentTools = [
      ...((nativeTools ?? []) as PerplexityAgentTool[]),
      ...functionTools,
    ];

    let reasoningConfig = agentOptions.reasoning;
    if (reasoningConfig == null && isCustomReasoning(reasoning)) {
      if (reasoning === 'none') {
        warnings.push({
          type: 'unsupported',
          feature: 'reasoning "none"',
        });
      } else {
        reasoningConfig = { effort: reasoning };
      }
    }

    const body: Record<string, unknown> = {
      ...agentOptions,
      ...modelSelection,
      input,
      max_output_tokens: maxOutputTokens,
      temperature,
      top_p: topP,
      reasoning: reasoningConfig,
      response_format:
        responseFormat?.type === 'json' && responseFormat.schema != null
          ? {
              type: 'json_schema',
              json_schema: {
                name: responseFormat.name ?? 'response',
                description: responseFormat.description,
                schema: responseFormat.schema,
                strict: true,
              },
            }
          : undefined,
      tools: agentTools.length > 0 ? agentTools : undefined,
    };

    if (responseFormat?.type === 'json' && responseFormat.schema == null) {
      warnings.push({
        type: 'unsupported',
        feature: 'JSON response format without a schema',
      });
    }

    return { args: body, warnings };
  }

  async doGenerate(
    options: LanguageModelV4CallOptions,
  ): Promise<LanguageModelV4GenerateResult> {
    const { args: body, warnings } = await this.getArgs(options);

    const url = `${this.config.baseURL}/v1/agent`;
    const {
      responseHeaders,
      value: response,
      rawValue: rawResponse,
    } = await postJsonToApi({
      url,
      headers: combineHeaders(this.config.headers?.(), options.headers),
      body,
      failedResponseHandler: createJsonErrorResponseHandler({
        errorSchema: perplexityErrorSchema,
        errorToMessage: perplexityErrorToMessage,
      }),
      successfulResponseHandler: createJsonResponseHandler(
        perplexityAgentResponseSchema,
      ),
      abortSignal: options.abortSignal,
      fetch: this.config.fetch,
    });

    if (response.error != null || response.status === 'failed') {
      throw new APICallError({
        message: response.error?.message ?? 'Perplexity response failed',
        url,
        requestBodyValues: body,
        statusCode: 400,
        responseHeaders,
        responseBody: rawResponse as string,
        isRetryable: false,
      });
    }

    const content: LanguageModelV4Content[] = [];
    const sourceIndexesByUrl = new Map<string, number>();
    let hasFunctionCall = false;

    const addSource = (source: PerplexityUrlSource) => {
      const existingIndex = sourceIndexesByUrl.get(source.url);
      if (existingIndex == null) {
        sourceIndexesByUrl.set(source.url, content.length);
        content.push(source);
      } else if (
        hasSearchResultId(source) &&
        !hasSearchResultId(content[existingIndex] as PerplexityUrlSource)
      ) {
        content[existingIndex] = source;
      }
    };

    for (const item of response.output) {
      if (item.type === 'message') {
        for (const part of item.content ?? []) {
          if (part.type === 'output_text' && part.text != null) {
            content.push({ type: 'text', text: part.text });
          }
          for (const annotation of part.annotations ?? []) {
            if (annotation.url != null) {
              addSource({
                type: 'source',
                sourceType: 'url',
                id: this.config.generateId(),
                url: annotation.url,
                title: annotation.title,
              });
            }
          }
        }
      } else if (item.type === 'search_results') {
        for (const result of getSearchResults(item)) {
          addSource(createSource(result, this.config.generateId));
        }
      } else if (item.type === 'fetch_url_results') {
        for (const result of getFetchedSources(item)) {
          addSource({
            type: 'source',
            sourceType: 'url',
            id: this.config.generateId(),
            url: result.url,
            title: result.title,
            providerMetadata: {
              perplexity: { snippet: result.snippet ?? null },
            },
          });
        }
      } else if (
        item.type === 'function_call' &&
        item.call_id != null &&
        item.name != null &&
        item.arguments != null
      ) {
        hasFunctionCall = true;
        content.push({
          type: 'tool-call',
          toolCallId: item.call_id,
          toolName: item.name,
          input: item.arguments,
          providerMetadata: {
            perplexity: {
              itemId: item.id ?? null,
              ...(item.thought_signature != null && {
                thoughtSignature: item.thought_signature,
              }),
            },
          },
        });
      }
    }

    const finishReason = response.incomplete_details?.reason ?? response.status;

    return {
      content,
      finishReason: {
        unified: mapPerplexityFinishReason({
          status: response.status,
          incompleteReason: response.incomplete_details?.reason,
          hasFunctionCall,
        }),
        raw: finishReason,
      },
      usage: convertPerplexityUsage(response.usage),
      request: { body },
      response: {
        ...getResponseMetadata(response),
        headers: responseHeaders,
        body: rawResponse,
      },
      warnings,
      providerMetadata: getProviderMetadata(response.usage),
    };
  }

  async doStream(
    options: LanguageModelV4CallOptions,
  ): Promise<LanguageModelV4StreamResult> {
    const { args, warnings } = await this.getArgs(options);
    const body = { ...args, stream: true };

    const { responseHeaders, value: response } = await postJsonToApi({
      url: `${this.config.baseURL}/v1/agent`,
      headers: combineHeaders(this.config.headers?.(), options.headers),
      body,
      failedResponseHandler: createJsonErrorResponseHandler({
        errorSchema: perplexityErrorSchema,
        errorToMessage: perplexityErrorToMessage,
      }),
      successfulResponseHandler: createEventSourceResponseHandler(
        perplexityAgentChunkSchema,
      ),
      abortSignal: options.abortSignal,
      fetch: this.config.fetch,
    });

    let finishReason: LanguageModelV4FinishReason = {
      unified: 'other',
      raw: undefined,
    };
    let usage: PerplexityUsage | undefined;
    let hasFunctionCall = false;
    let hasResponseMetadata = false;
    let activeReasoningId: string | undefined;
    const activeTextIds = new Set<string>();
    const emittedSourcesByUrl = new Map<string, boolean>();
    const seenFunctionCalls = new Set<string>();
    const generateId = this.config.generateId;

    return {
      stream: response.pipeThrough(
        new TransformStream<
          ParseResult<z.infer<typeof perplexityAgentChunkSchema>>,
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

            const emitSource = (source: PerplexityUrlSource) => {
              const hasResultId = hasSearchResultId(source);
              const previousHasResultId = emittedSourcesByUrl.get(source.url);
              if (
                previousHasResultId == null ||
                (hasResultId && !previousHasResultId)
              ) {
                emittedSourcesByUrl.set(source.url, hasResultId);
                controller.enqueue(source);
              }
            };

            const emitReasoningThought = (thought: string | undefined) => {
              if (activeReasoningId != null && thought != null) {
                controller.enqueue({
                  type: 'reasoning-delta',
                  id: activeReasoningId,
                  delta: thought,
                });
              }
            };

            const emitFunctionCall = (item: PerplexityOutputItem) => {
              if (
                item.type !== 'function_call' ||
                item.call_id == null ||
                item.name == null ||
                item.arguments == null ||
                seenFunctionCalls.has(item.call_id)
              ) {
                return;
              }
              seenFunctionCalls.add(item.call_id);
              hasFunctionCall = true;
              controller.enqueue({
                type: 'tool-input-start',
                id: item.call_id,
                toolName: item.name,
              });
              controller.enqueue({
                type: 'tool-input-delta',
                id: item.call_id,
                delta: item.arguments,
              });
              controller.enqueue({ type: 'tool-input-end', id: item.call_id });
              controller.enqueue({
                type: 'tool-call',
                toolCallId: item.call_id,
                toolName: item.name,
                input: item.arguments,
                providerMetadata: {
                  perplexity: {
                    itemId: item.id ?? null,
                    ...(item.thought_signature != null && {
                      thoughtSignature: item.thought_signature,
                    }),
                  },
                },
              });
            };

            const emitOutputSources = (item: PerplexityOutputItem) => {
              for (const result of getSearchResults(item)) {
                emitSource(createSource(result, generateId));
              }
              for (const result of getFetchedSources(item)) {
                emitSource({
                  type: 'source',
                  sourceType: 'url',
                  id: generateId(),
                  url: result.url,
                  title: result.title,
                  providerMetadata: {
                    perplexity: { snippet: result.snippet ?? null },
                  },
                });
              }
            };

            switch (value.type) {
              case 'response.created':
              case 'response.in_progress': {
                if (!hasResponseMetadata && value.response != null) {
                  controller.enqueue({
                    type: 'response-metadata',
                    ...getResponseMetadata(value.response),
                  });
                  hasResponseMetadata = true;
                }
                break;
              }

              case 'response.output_text.delta': {
                const textId =
                  value.item_id ?? String(value.output_index ?? 'text');
                if (!activeTextIds.has(textId)) {
                  activeTextIds.add(textId);
                  controller.enqueue({ type: 'text-start', id: textId });
                }
                if (value.delta != null) {
                  controller.enqueue({
                    type: 'text-delta',
                    id: textId,
                    delta: value.delta,
                  });
                }
                break;
              }

              case 'response.output_text.done': {
                const textId =
                  value.item_id ?? String(value.output_index ?? 'text');
                if (activeTextIds.delete(textId)) {
                  controller.enqueue({ type: 'text-end', id: textId });
                }
                break;
              }

              case 'response.reasoning.started': {
                if (activeReasoningId != null) {
                  controller.enqueue({
                    type: 'reasoning-end',
                    id: activeReasoningId,
                  });
                }
                activeReasoningId = `reasoning-${
                  value.sequence_number ?? generateId()
                }`;
                controller.enqueue({
                  type: 'reasoning-start',
                  id: activeReasoningId,
                });
                emitReasoningThought(value.thought);
                break;
              }

              case 'response.reasoning.search_queries':
              case 'response.reasoning.fetch_url_queries': {
                emitReasoningThought(value.thought);
                break;
              }

              case 'response.reasoning.search_results': {
                emitReasoningThought(value.thought);
                for (const result of value.results ?? []) {
                  emitSource(createSource(result, generateId));
                }
                break;
              }

              case 'response.reasoning.fetch_url_results': {
                emitReasoningThought(value.thought);
                for (const result of value.contents ?? []) {
                  emitSource({
                    type: 'source',
                    sourceType: 'url',
                    id: generateId(),
                    url: result.url,
                    title: result.title,
                    providerMetadata: {
                      perplexity: { snippet: result.snippet ?? null },
                    },
                  });
                }
                break;
              }

              case 'response.reasoning.stopped': {
                emitReasoningThought(value.thought);
                if (activeReasoningId != null) {
                  controller.enqueue({
                    type: 'reasoning-end',
                    id: activeReasoningId,
                  });
                  activeReasoningId = undefined;
                }
                break;
              }

              case 'response.output_item.done': {
                if (value.item != null) {
                  emitOutputSources(value.item);
                  emitFunctionCall(value.item);
                }
                break;
              }

              case 'response.completed':
              case 'response.incomplete': {
                if (value.response != null) {
                  if (!hasResponseMetadata) {
                    controller.enqueue({
                      type: 'response-metadata',
                      ...getResponseMetadata(value.response),
                    });
                    hasResponseMetadata = true;
                  }
                  for (const item of value.response.output) {
                    emitOutputSources(item);
                    emitFunctionCall(item);
                  }
                  usage = value.response.usage ?? undefined;
                  const rawFinishReason =
                    value.response.incomplete_details?.reason ??
                    value.response.status;
                  finishReason = {
                    unified: mapPerplexityFinishReason({
                      status: value.response.status,
                      incompleteReason:
                        value.response.incomplete_details?.reason,
                      hasFunctionCall,
                    }),
                    raw: rawFinishReason,
                  };
                }
                break;
              }

              case 'response.failed': {
                finishReason = { unified: 'error', raw: 'failed' };
                controller.enqueue({
                  type: 'error',
                  error: value.error ?? new Error('Perplexity response failed'),
                });
                break;
              }
            }
          },

          flush(controller) {
            if (activeReasoningId != null) {
              controller.enqueue({
                type: 'reasoning-end',
                id: activeReasoningId,
              });
            }
            for (const id of activeTextIds) {
              controller.enqueue({ type: 'text-end', id });
            }
            controller.enqueue({
              type: 'finish',
              finishReason,
              usage: convertPerplexityUsage(usage),
              providerMetadata: getProviderMetadata(usage),
            });
          },
        }),
      ),
      request: { body },
      response: { headers: responseHeaders },
    };
  }
}

export {
  perplexityErrorSchema,
  perplexityErrorToMessage,
} from './perplexity-agent-api';
export type { PerplexityErrorData } from './perplexity-agent-api';
