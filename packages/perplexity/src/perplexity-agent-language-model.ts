import {
  APICallError,
  type JSONValue,
  type LanguageModelV4,
  type LanguageModelV4CallOptions,
  type LanguageModelV4Content,
  type LanguageModelV4FinishReason,
  type LanguageModelV4GenerateResult,
  type LanguageModelV4StreamPart,
  type LanguageModelV4StreamResult,
  type LanguageModelV4Usage,
  type SharedV4ProviderMetadata,
  type SharedV4Warning,
} from '@ai-sdk/provider';
import {
  combineHeaders,
  createEventSourceResponseHandler,
  createJsonErrorResponseHandler,
  createJsonResponseHandler,
  createNullLanguageModelUsage,
  isCustomReasoning,
  jsonSchema,
  parseProviderOptions,
  postJsonToApi,
  serializeModelOptions,
  WORKFLOW_DESERIALIZE,
  WORKFLOW_SERIALIZE,
  type FetchFunction,
  type ParseResult,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';
import { convertToPerplexityAgentInput } from './convert-to-perplexity-agent-input';
import {
  perplexityAgentOptions,
  type PerplexityAgentModelId,
  type PerplexityAgentPreset,
} from './perplexity-agent-language-model-options';

type PerplexityAgentConfig = {
  baseURL: string;
  headers?: () => Record<string, string | undefined>;
  generateId: () => string;
  fetch?: FetchFunction;
};

type AgentSelector =
  | { type: 'model'; value: PerplexityAgentModelId }
  | { type: 'preset'; value: PerplexityAgentPreset };

type AgentAnnotation = {
  type?: string;
  url?: string;
  title?: string;
  start_index?: number;
  end_index?: number;
};

type AgentSearchResult = {
  id?: number;
  url: string;
  title?: string;
  snippet?: string;
  source?: string;
  date?: string;
  last_updated?: string;
};

type AgentOutputItem =
  | {
      type: 'message';
      id: string;
      content: Array<{
        type: string;
        text: string;
        annotations?: AgentAnnotation[];
      }>;
    }
  | {
      type: 'function_call';
      id: string;
      call_id: string;
      name: string;
      arguments: string;
    }
  | {
      type: 'search_results' | 'people_search_results';
      queries?: string[];
      results: AgentSearchResult[];
    }
  | {
      type: 'fetch_url_results';
      contents: AgentSearchResult[];
    }
  | {
      type: 'finance_results';
      categories?: string[];
      tickers?: string[];
      results: Array<{
        category: string;
        content: string;
        tickers?: string[];
        sources?: string[];
      }>;
    }
  | ({
      type:
        | 'sandbox_results'
        | 'mcp_list_tools'
        | 'mcp_call'
        | 'tool_search_output';
    } & Record<string, JSONValue>);

type AgentUsage = {
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  input_tokens_details?: {
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
  };
  tool_calls_details?: Record<string, { invocation?: number }>;
  cost?: {
    currency?: string;
    input_cost?: number;
    output_cost?: number;
    total_cost?: number;
    cache_creation_cost?: number;
    cache_read_cost?: number;
    tool_calls_cost?: number;
  };
};

type AgentResponse = {
  id: string;
  object: 'response';
  created_at: number;
  status: 'completed' | 'failed' | 'incomplete' | 'in_progress';
  model: string;
  output: AgentOutputItem[];
  usage?: AgentUsage;
  error?: { message: string; code?: string; type?: string } | null;
};

type AgentChunk = {
  type: string;
  sequence_number?: number;
  response?: AgentResponse;
  error?: { message: string; code?: string; type?: string };
  item?: AgentOutputItem;
  item_id?: string;
  delta?: string;
  text?: string;
  thought?: string;
  results?: AgentSearchResult[];
  contents?: AgentSearchResult[];
};

const agentErrorSchema = z.object({
  error: z.object({
    message: z.string(),
    code: z.string().optional(),
    type: z.string().optional(),
  }),
});

export class PerplexityAgentLanguageModel implements LanguageModelV4 {
  readonly specificationVersion = 'v4';
  readonly provider = 'perplexity.responses';
  readonly modelId: PerplexityAgentModelId | PerplexityAgentPreset;

  private readonly config: PerplexityAgentConfig;
  private readonly selector: AgentSelector;

  static [WORKFLOW_SERIALIZE](model: PerplexityAgentLanguageModel) {
    return serializeModelOptions({
      modelId: model.modelId,
      config: model.config,
    });
  }

  static [WORKFLOW_DESERIALIZE](options: {
    modelId: PerplexityAgentModelId | PerplexityAgentPreset;
    config: PerplexityAgentConfig;
  }) {
    return new PerplexityAgentLanguageModel(options.modelId, options.config);
  }

  constructor(
    modelId: PerplexityAgentModelId | PerplexityAgentPreset,
    config: PerplexityAgentConfig,
  ) {
    this.modelId = modelId;
    this.config = config;
    this.selector = isPreset(modelId)
      ? { type: 'preset', value: modelId }
      : { type: 'model', value: modelId };
  }

  readonly supportedUrls: Record<string, RegExp[]> = {
    'image/*': [/^https?:\/\/.*$/],
  };

  private async getArgs(
    options: LanguageModelV4CallOptions,
  ): Promise<{ body: Record<string, unknown>; warnings: SharedV4Warning[] }> {
    const warnings: SharedV4Warning[] = [];

    if (options.stopSequences != null) {
      warnings.push({ type: 'unsupported', feature: 'stopSequences' });
    }
    if (options.topK != null) {
      warnings.push({ type: 'unsupported', feature: 'topK' });
    }
    if (options.seed != null) {
      warnings.push({ type: 'unsupported', feature: 'seed' });
    }
    if (options.presencePenalty != null) {
      warnings.push({ type: 'unsupported', feature: 'presencePenalty' });
    }
    if (options.frequencyPenalty != null) {
      warnings.push({ type: 'unsupported', feature: 'frequencyPenalty' });
    }

    const {
      input,
      instructions,
      warnings: inputWarnings,
    } = await convertToPerplexityAgentInput({ prompt: options.prompt });
    warnings.push(...inputWarnings);

    const providerOptions =
      (await parseProviderOptions({
        provider: 'perplexity',
        providerOptions: options.providerOptions,
        schema: perplexityAgentOptions,
      })) ?? {};

    const tools: Array<Record<string, unknown>> = [];
    for (const tool of options.tools ?? []) {
      if (tool.type === 'function') {
        tools.push({
          type: 'function',
          name: tool.name,
          description: tool.description,
          parameters: tool.inputSchema,
          strict: tool.strict,
        });
        continue;
      }

      const prepared = prepareProviderTool(tool);
      if (prepared == null) {
        warnings.push({
          type: 'unsupported',
          feature: `provider-defined tool ${tool.id}`,
        });
      } else {
        tools.push(prepared);
      }
    }

    if (options.toolChoice != null && options.toolChoice.type !== 'auto') {
      warnings.push({ type: 'unsupported', feature: 'toolChoice' });
    }

    return {
      body: {
        [this.selector.type]: this.selector.value,
        input,
        instructions,
        max_output_tokens: options.maxOutputTokens,
        temperature: options.temperature,
        top_p: options.topP,
        reasoning: isCustomReasoning(options.reasoning)
          ? {
              effort:
                options.reasoning === 'none' ? 'minimal' : options.reasoning,
            }
          : undefined,
        response_format:
          options.responseFormat?.type === 'json'
            ? {
                type: 'json_schema',
                json_schema: {
                  name: options.responseFormat.name ?? 'response',
                  description: options.responseFormat.description,
                  schema: options.responseFormat.schema,
                },
              }
            : undefined,
        tools: tools.length > 0 ? tools : undefined,
        ...providerOptions,
      },
      warnings,
    };
  }

  async doGenerate(
    options: LanguageModelV4CallOptions,
  ): Promise<LanguageModelV4GenerateResult> {
    const { body, warnings } = await this.getArgs(options);
    const url = `${this.config.baseURL}/v1/agent`;

    const {
      responseHeaders,
      value: response,
      rawValue,
    } = await postJsonToApi({
      url,
      headers: combineHeaders(this.config.headers?.(), options.headers),
      body,
      failedResponseHandler: createJsonErrorResponseHandler({
        errorSchema: agentErrorSchema,
        errorToMessage: error => error.error.message,
      }),
      successfulResponseHandler: createJsonResponseHandler(
        jsonSchema<AgentResponse>(() => {
          throw new Error('JSON schema not implemented');
        }),
      ),
      abortSignal: options.abortSignal,
      fetch: this.config.fetch,
    });

    if (response.error != null) {
      throw new APICallError({
        message: response.error.message,
        url,
        requestBodyValues: body,
        statusCode: 400,
        responseHeaders,
        responseBody: rawValue as string,
        isRetryable: false,
      });
    }

    const { content, hasToolCalls } = convertAgentOutput({
      output: response.output,
      generateId: this.config.generateId,
    });

    return {
      content,
      finishReason: getFinishReason(response, hasToolCalls),
      usage: convertAgentUsage(response.usage),
      request: { body },
      response: {
        id: response.id,
        timestamp: new Date(response.created_at * 1000),
        modelId: response.model,
        headers: responseHeaders,
        body: rawValue,
      },
      providerMetadata: createProviderMetadata(response),
      warnings,
    };
  }

  async doStream(
    options: LanguageModelV4CallOptions,
  ): Promise<LanguageModelV4StreamResult> {
    const { body, warnings } = await this.getArgs(options);
    const url = `${this.config.baseURL}/v1/agent`;

    const { responseHeaders, value: response } = await postJsonToApi({
      url,
      headers: combineHeaders(this.config.headers?.(), options.headers),
      body: { ...body, stream: true },
      failedResponseHandler: createJsonErrorResponseHandler({
        errorSchema: agentErrorSchema,
        errorToMessage: error => error.error.message,
      }),
      successfulResponseHandler: createEventSourceResponseHandler(z.any()),
      abortSignal: options.abortSignal,
      fetch: this.config.fetch,
    });

    let usage = createNullLanguageModelUsage();
    let finishReason: LanguageModelV4FinishReason = {
      unified: 'other',
      raw: undefined,
    };
    let providerMetadata: SharedV4ProviderMetadata | undefined;
    let responseMetadataSent = false;
    let activeReasoningId: string | undefined;
    const emittedSourceUrls = new Set<string>();
    const generateId = this.config.generateId;

    return {
      stream: response.pipeThrough(
        new TransformStream<ParseResult<AgentChunk>, LanguageModelV4StreamPart>(
          {
            start(controller) {
              controller.enqueue({ type: 'stream-start', warnings });
            },

            transform(parseResult, controller) {
              if (options.includeRawChunks) {
                controller.enqueue({
                  type: 'raw',
                  rawValue: parseResult.rawValue,
                });
              }

              if (!parseResult.success) {
                controller.enqueue({ type: 'error', error: parseResult.error });
                return;
              }

              const chunk = parseResult.value;

              if (
                !responseMetadataSent &&
                (chunk.type === 'response.created' ||
                  chunk.type === 'response.in_progress') &&
                chunk.response != null
              ) {
                controller.enqueue({
                  type: 'response-metadata',
                  id: chunk.response.id,
                  timestamp: new Date(chunk.response.created_at * 1000),
                  modelId: chunk.response.model,
                });
                responseMetadataSent = true;
              }

              if (chunk.type === 'response.output_item.added') {
                if (chunk.item?.type === 'message') {
                  controller.enqueue({
                    type: 'text-start',
                    id: chunk.item.id,
                  });
                }
              } else if (chunk.type === 'response.output_text.delta') {
                controller.enqueue({
                  type: 'text-delta',
                  id: chunk.item_id!,
                  delta: chunk.delta ?? '',
                });
              } else if (
                chunk.type === 'response.output_item.done' &&
                chunk.item != null
              ) {
                if (chunk.item.type === 'message') {
                  controller.enqueue({
                    type: 'text-end',
                    id: chunk.item.id,
                    providerMetadata: {
                      perplexity: {
                        itemId: chunk.item.id,
                        annotations: chunk.item.content.flatMap(
                          part => part.annotations ?? [],
                        ) as unknown as JSONValue,
                      },
                    },
                  });
                } else if (chunk.item.type === 'function_call') {
                  controller.enqueue({
                    type: 'tool-call',
                    toolCallId: chunk.item.call_id,
                    toolName: chunk.item.name,
                    input: chunk.item.arguments,
                    providerMetadata: {
                      perplexity: { itemId: chunk.item.id },
                    },
                  });
                } else {
                  controller.enqueue({
                    type: 'custom',
                    kind: `perplexity.${chunk.item.type}`,
                    providerMetadata: {
                      perplexity: {
                        output: chunk.item as unknown as JSONValue,
                      },
                    },
                  });
                }
              } else if (chunk.type === 'response.reasoning.started') {
                activeReasoningId = `reasoning-${chunk.sequence_number ?? 0}`;
                controller.enqueue({
                  type: 'reasoning-start',
                  id: activeReasoningId,
                });
                if (chunk.thought) {
                  controller.enqueue({
                    type: 'reasoning-delta',
                    id: activeReasoningId,
                    delta: chunk.thought,
                  });
                }
              } else if (
                chunk.type === 'response.reasoning.search_queries' ||
                chunk.type === 'response.reasoning.search_results' ||
                chunk.type === 'response.reasoning.fetch_url_queries' ||
                chunk.type === 'response.reasoning.fetch_url_results'
              ) {
                if (activeReasoningId != null && chunk.thought) {
                  controller.enqueue({
                    type: 'reasoning-delta',
                    id: activeReasoningId,
                    delta: chunk.thought,
                  });
                }

                emitSources({
                  controller,
                  results: chunk.results ?? chunk.contents ?? [],
                  emittedSourceUrls,
                  generateId,
                });
              } else if (chunk.type === 'response.reasoning.stopped') {
                if (activeReasoningId != null) {
                  if (chunk.thought) {
                    controller.enqueue({
                      type: 'reasoning-delta',
                      id: activeReasoningId,
                      delta: chunk.thought,
                    });
                  }
                  controller.enqueue({
                    type: 'reasoning-end',
                    id: activeReasoningId,
                  });
                  activeReasoningId = undefined;
                }
              } else if (chunk.type === 'response.completed') {
                const completedResponse = chunk.response;
                if (completedResponse != null) {
                  usage = convertAgentUsage(completedResponse.usage);
                  finishReason = getFinishReason(
                    completedResponse,
                    completedResponse.output.some(
                      item => item.type === 'function_call',
                    ),
                  );
                  providerMetadata = createProviderMetadata(completedResponse);

                  const sources = collectSources({
                    output: completedResponse.output,
                    generateId,
                  });
                  for (const source of sources) {
                    if (!emittedSourceUrls.has(source.url)) {
                      emittedSourceUrls.add(source.url);
                      controller.enqueue(source);
                    }
                  }
                }
              } else if (chunk.type === 'response.failed') {
                finishReason = {
                  unified: 'error',
                  raw: chunk.error?.code ?? 'failed',
                };
                controller.enqueue({
                  type: 'error',
                  error: chunk.error ?? new Error('Perplexity response failed'),
                });
              }
            },

            flush(controller) {
              if (activeReasoningId != null) {
                controller.enqueue({
                  type: 'reasoning-end',
                  id: activeReasoningId,
                });
              }

              controller.enqueue({
                type: 'finish',
                finishReason,
                usage,
                providerMetadata,
              });
            },
          },
        ),
      ),
      request: { body },
      response: { headers: responseHeaders },
    };
  }
}

function isPreset(
  value: PerplexityAgentModelId | PerplexityAgentPreset,
): value is PerplexityAgentPreset {
  return ['fast', 'low', 'medium', 'high', 'xhigh'].includes(value);
}

function prepareProviderTool(tool: {
  id: `${string}.${string}`;
  args: Record<string, unknown>;
}): Record<string, unknown> | undefined {
  switch (tool.id) {
    case 'perplexity.web_search': {
      const {
        filters,
        searchContextSize,
        maxResults,
        maxTokens,
        maxTokensPerPage,
        userLocation,
      } = tool.args;
      const typedFilters = filters as
        | {
            searchDomainFilter?: string[];
            searchLanguageFilter?: string[];
            searchRecencyFilter?: string;
            searchAfterDate?: string;
            searchBeforeDate?: string;
          }
        | undefined;
      return {
        type: 'web_search',
        filters:
          typedFilters == null
            ? undefined
            : {
                search_domain_filter: typedFilters.searchDomainFilter,
                search_language_filter: typedFilters.searchLanguageFilter,
                search_recency_filter: typedFilters.searchRecencyFilter,
                search_after_date: typedFilters.searchAfterDate,
                search_before_date: typedFilters.searchBeforeDate,
              },
        search_context_size: searchContextSize,
        max_results: maxResults,
        max_tokens: maxTokens,
        max_tokens_per_page: maxTokensPerPage,
        user_location:
          userLocation == null
            ? undefined
            : {
                country: (userLocation as { country?: string }).country,
                city: (userLocation as { city?: string }).city,
                region: (userLocation as { region?: string }).region,
                latitude: (userLocation as { latitude?: number }).latitude,
                longitude: (userLocation as { longitude?: number }).longitude,
              },
      };
    }
    case 'perplexity.fetch_url':
      return { type: 'fetch_url', max_urls: tool.args.maxUrls };
    case 'perplexity.finance_search':
      return { type: 'finance_search' };
    case 'perplexity.people_search':
      return { type: 'people_search' };
    case 'perplexity.sandbox':
      return { type: 'sandbox' };
    case 'perplexity.mcp':
      return {
        type: 'mcp',
        server_label: tool.args.serverLabel,
        server_url: tool.args.serverUrl,
        authorization: tool.args.authorization,
        headers: tool.args.headers,
        allowed_tools: tool.args.allowedTools,
        defer_loading: tool.args.deferLoading,
      };
    default:
      return undefined;
  }
}

function convertAgentOutput({
  output,
  generateId,
}: {
  output: AgentOutputItem[];
  generateId: () => string;
}): { content: LanguageModelV4Content[]; hasToolCalls: boolean } {
  const content: LanguageModelV4Content[] = [];
  let hasToolCalls = false;

  for (const item of output) {
    if (item.type === 'message') {
      for (const part of item.content) {
        content.push({
          type: 'text',
          text: part.text,
          providerMetadata: {
            perplexity: {
              itemId: item.id,
              annotations: (part.annotations ?? []) as unknown as JSONValue,
            },
          },
        });
      }
    } else if (item.type === 'function_call') {
      hasToolCalls = true;
      content.push({
        type: 'tool-call',
        toolCallId: item.call_id,
        toolName: item.name,
        input: item.arguments,
        providerMetadata: {
          perplexity: { itemId: item.id },
        },
      });
    } else {
      content.push({
        type: 'custom',
        kind: `perplexity.${item.type}`,
        providerMetadata: {
          perplexity: { output: item as unknown as JSONValue },
        },
      });
    }
  }

  content.push(...collectSources({ output, generateId }));
  return { content, hasToolCalls };
}

function collectSources({
  output,
  generateId,
}: {
  output: AgentOutputItem[];
  generateId: () => string;
}) {
  const sources: Array<
    Extract<LanguageModelV4Content, { type: 'source'; sourceType: 'url' }>
  > = [];
  const urls = new Set<string>();

  const addSource = ({
    url,
    title,
    metadata,
  }: {
    url: string | undefined;
    title?: string;
    metadata?: Record<string, JSONValue>;
  }) => {
    if (url == null || urls.has(url)) {
      return;
    }
    urls.add(url);
    sources.push({
      type: 'source',
      sourceType: 'url',
      id: generateId(),
      url,
      title,
      providerMetadata: metadata == null ? undefined : { perplexity: metadata },
    });
  };

  for (const item of output) {
    if (
      item.type === 'search_results' ||
      item.type === 'people_search_results'
    ) {
      for (const result of item.results) {
        addSource({
          url: result.url,
          title: result.title,
          metadata: {
            sourceType: item.type,
            snippet: result.snippet ?? null,
            source: result.source ?? null,
            date: result.date ?? null,
            lastUpdated: result.last_updated ?? null,
          },
        });
      }
    } else if (item.type === 'fetch_url_results') {
      for (const result of item.contents) {
        addSource({
          url: result.url,
          title: result.title,
          metadata: {
            sourceType: item.type,
            snippet: result.snippet ?? null,
          },
        });
      }
    } else if (item.type === 'finance_results') {
      for (const result of item.results) {
        for (const url of result.sources ?? []) {
          addSource({
            url,
            metadata: {
              sourceType: item.type,
              category: result.category,
              tickers: result.tickers ?? [],
            },
          });
        }
      }
    } else if (item.type === 'message') {
      for (const annotation of item.content.flatMap(
        part => part.annotations ?? [],
      )) {
        addSource({
          url: annotation.url,
          title: annotation.title,
          metadata: {
            sourceType: 'url_citation',
            startIndex: annotation.start_index ?? null,
            endIndex: annotation.end_index ?? null,
          },
        });
      }
    }
  }

  return sources;
}

function emitSources({
  controller,
  results,
  emittedSourceUrls,
  generateId,
}: {
  controller: TransformStreamDefaultController<LanguageModelV4StreamPart>;
  results: AgentSearchResult[];
  emittedSourceUrls: Set<string>;
  generateId: () => string;
}) {
  for (const result of results) {
    if (emittedSourceUrls.has(result.url)) {
      continue;
    }
    emittedSourceUrls.add(result.url);
    controller.enqueue({
      type: 'source',
      sourceType: 'url',
      id: generateId(),
      url: result.url,
      title: result.title,
      providerMetadata: {
        perplexity: {
          snippet: result.snippet ?? null,
          source: result.source ?? null,
        },
      },
    });
  }
}

function convertAgentUsage(
  usage: AgentUsage | undefined,
): LanguageModelV4Usage {
  if (usage == null) {
    return createNullLanguageModelUsage();
  }

  const cacheRead = usage.input_tokens_details?.cache_read_input_tokens ?? 0;
  const cacheWrite =
    usage.input_tokens_details?.cache_creation_input_tokens ?? 0;

  return {
    inputTokens: {
      total: usage.input_tokens,
      noCache: Math.max(0, usage.input_tokens - cacheRead - cacheWrite),
      cacheRead,
      cacheWrite,
    },
    outputTokens: {
      total: usage.output_tokens,
      text: usage.output_tokens,
      reasoning: undefined,
    },
    raw: usage,
  };
}

function getFinishReason(
  response: AgentResponse,
  hasToolCalls: boolean,
): LanguageModelV4FinishReason {
  if (response.status === 'failed') {
    return { unified: 'error', raw: response.error?.code ?? 'failed' };
  }
  if (response.status === 'incomplete') {
    return { unified: 'length', raw: 'incomplete' };
  }
  if (hasToolCalls) {
    return { unified: 'tool-calls', raw: undefined };
  }
  return { unified: 'stop', raw: undefined };
}

function createProviderMetadata(
  response: AgentResponse,
): SharedV4ProviderMetadata {
  const cost = response.usage?.cost;
  return {
    perplexity: {
      output: response.output as unknown as JSONValue,
      toolCalls: (response.usage?.tool_calls_details ??
        null) as unknown as JSONValue,
      cost:
        cost == null
          ? null
          : {
              currency: cost.currency ?? null,
              inputCost: cost.input_cost ?? null,
              outputCost: cost.output_cost ?? null,
              totalCost: cost.total_cost ?? null,
              cacheCreationCost: cost.cache_creation_cost ?? null,
              cacheReadCost: cost.cache_read_cost ?? null,
              toolCallsCost: cost.tool_calls_cost ?? null,
            },
    },
  };
}
