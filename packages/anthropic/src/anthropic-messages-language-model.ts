import {
  APICallError,
  LanguageModelV2,
  LanguageModelV2CallWarning,
  LanguageModelV2Content,
  LanguageModelV2FinishReason,
  LanguageModelV2FunctionTool,
  LanguageModelV2StreamPart,
  LanguageModelV2Usage,
  SharedV2ProviderMetadata,
  UnsupportedFunctionalityError,
} from '@ai-sdk/provider';
import {
  FetchFunction,
  ParseResult,
  Resolvable,
  combineHeaders,
  createEventSourceResponseHandler,
  createJsonResponseHandler,
  generateId,
  parseProviderOptions,
  postJsonToApi,
  resolve,
} from '@ai-sdk/provider-utils';
import { z } from 'zod';
import { anthropicFailedResponseHandler } from './anthropic-error';
import {
  AnthropicMessagesModelId,
  anthropicProviderOptions,
} from './anthropic-messages-options';
import { prepareTools } from './anthropic-prepare-tools';
import { convertToAnthropicMessagesPrompt } from './convert-to-anthropic-messages-prompt';
import { mapAnthropicStopReason } from './map-anthropic-stop-reason';

type AnthropicMessagesConfig = {
  provider: string;
  baseURL: string;
  headers: Resolvable<Record<string, string | undefined>>;
  fetch?: FetchFunction;
  buildRequestUrl?: (baseURL: string, isStreaming: boolean) => string;
  transformRequestBody?: (args: Record<string, any>) => Record<string, any>;
  supportedUrls?: () => LanguageModelV2['supportedUrls'];
  generateId?: () => string;
};

export class AnthropicMessagesLanguageModel implements LanguageModelV2 {
  readonly specificationVersion = 'v2';

  readonly modelId: AnthropicMessagesModelId;

  private readonly config: AnthropicMessagesConfig;
  private readonly generateId: () => string;

  constructor(
    modelId: AnthropicMessagesModelId,
    config: AnthropicMessagesConfig,
  ) {
    this.modelId = modelId;
    this.config = config;
    this.generateId = config.generateId ?? generateId;
  }

  supportsUrl(url: URL): boolean {
    return url.protocol === 'https:';
  }

  get provider(): string {
    return this.config.provider;
  }

  get supportedUrls() {
    return this.config.supportedUrls?.() ?? {};
  }

  private async getArgs({
    prompt,
    maxOutputTokens = 4096, // 4096: max model output tokens TODO update default in v5
    temperature,
    topP,
    topK,
    frequencyPenalty,
    presencePenalty,
    stopSequences,
    responseFormat,
    seed,
    tools,
    toolChoice,
    providerOptions,
  }: Parameters<LanguageModelV2['doGenerate']>[0]) {
    const warnings: LanguageModelV2CallWarning[] = [];

    if (frequencyPenalty != null) {
      warnings.push({
        type: 'unsupported-setting',
        setting: 'frequencyPenalty',
      });
    }

    if (presencePenalty != null) {
      warnings.push({
        type: 'unsupported-setting',
        setting: 'presencePenalty',
      });
    }

    if (seed != null) {
      warnings.push({
        type: 'unsupported-setting',
        setting: 'seed',
      });
    }

    if (responseFormat?.type === 'json') {
      if (responseFormat.schema == null) {
        warnings.push({
          type: 'unsupported-setting',
          setting: 'responseFormat',
          details:
            'JSON response format requires a schema. ' +
            'The response format is ignored.',
        });
      } else if (tools != null) {
        warnings.push({
          type: 'unsupported-setting',
          setting: 'tools',
          details:
            'JSON response format does not support tools. ' +
            'The provided tools are ignored.',
        });
      }
    }

    const jsonResponseTool: LanguageModelV2FunctionTool | undefined =
      responseFormat?.type === 'json' && responseFormat.schema != null
        ? {
            type: 'function',
            name: 'json',
            description: 'Respond with a JSON object.',
            parameters: responseFormat.schema,
          }
        : undefined;

    const anthropicOptions = await parseProviderOptions({
      provider: 'anthropic',
      providerOptions,
      schema: anthropicProviderOptions,
    });

    const { prompt: messagesPrompt, betas: messagesBetas } =
      await convertToAnthropicMessagesPrompt({
        prompt,
        sendReasoning: anthropicOptions?.sendReasoning ?? true,
        warnings,
      });

    const isThinking = anthropicOptions?.thinking?.type === 'enabled';
    const thinkingBudget = anthropicOptions?.thinking?.budgetTokens;

    const baseArgs = {
      // model id:
      model: this.modelId,

      // standardized settings:
      max_tokens: maxOutputTokens,
      temperature,
      top_k: topK,
      top_p: topP,
      stop_sequences: stopSequences,

      // provider specific settings:
      ...(isThinking && {
        thinking: { type: 'enabled', budget_tokens: thinkingBudget },
      }),

      // prompt:
      system: messagesPrompt.system,
      messages: messagesPrompt.messages,
    };

    if (isThinking) {
      if (thinkingBudget == null) {
        throw new UnsupportedFunctionalityError({
          functionality: 'thinking requires a budget',
        });
      }

      if (baseArgs.temperature != null) {
        baseArgs.temperature = undefined;
        warnings.push({
          type: 'unsupported-setting',
          setting: 'temperature',
          details: 'temperature is not supported when thinking is enabled',
        });
      }

      if (topK != null) {
        baseArgs.top_k = undefined;
        warnings.push({
          type: 'unsupported-setting',
          setting: 'topK',
          details: 'topK is not supported when thinking is enabled',
        });
      }

      if (topP != null) {
        baseArgs.top_p = undefined;
        warnings.push({
          type: 'unsupported-setting',
          setting: 'topP',
          details: 'topP is not supported when thinking is enabled',
        });
      }

      // adjust max tokens to account for thinking:
      baseArgs.max_tokens = maxOutputTokens + thinkingBudget;
    }

    let modifiedTools = tools;
    let modifiedToolChoice = toolChoice;

    if (anthropicOptions?.webSearch) {
      const webSearchTool: any = {
        type: 'web_search_20250305',
        name: 'web_search',
        max_uses: anthropicOptions.webSearch.maxUses,
        allowed_domains: anthropicOptions.webSearch.allowedDomains,
        blocked_domains: anthropicOptions.webSearch.blockedDomains,
        ...(anthropicOptions.webSearch.userLocation && {
          user_location: {
            type: anthropicOptions.webSearch.userLocation.type,
            country: anthropicOptions.webSearch.userLocation.country,
            city: anthropicOptions.webSearch.userLocation.city,
            region: anthropicOptions.webSearch.userLocation.region,
            timezone: anthropicOptions.webSearch.userLocation.timezone,
          },
        }),
      };

      modifiedTools = tools ? [...tools, webSearchTool] : [webSearchTool];
    }

    const {
      tools: anthropicTools,
      toolChoice: anthropicToolChoice,
      toolWarnings,
      betas: toolsBetas,
    } = prepareTools(
      jsonResponseTool != null
        ? {
            tools: [jsonResponseTool],
            toolChoice: { type: 'tool', toolName: jsonResponseTool.name },
          }
        : { tools: modifiedTools, toolChoice: modifiedToolChoice },
    );

    return {
      args: {
        ...baseArgs,
        tools: anthropicTools,
        tool_choice: anthropicToolChoice,
      },
      warnings: [...warnings, ...toolWarnings],
      betas: new Set([...messagesBetas, ...toolsBetas]),
      jsonResponseTool,
    };
  }

  private async getHeaders({
    betas,
    headers,
  }: {
    betas: Set<string>;
    headers: Record<string, string | undefined> | undefined;
  }) {
    return combineHeaders(
      await resolve(this.config.headers),
      betas.size > 0 ? { 'anthropic-beta': Array.from(betas).join(',') } : {},
      headers,
    );
  }

  private buildRequestUrl(isStreaming: boolean): string {
    return (
      this.config.buildRequestUrl?.(this.config.baseURL, isStreaming) ??
      `${this.config.baseURL}/messages`
    );
  }

  private transformRequestBody(args: Record<string, any>): Record<string, any> {
    return this.config.transformRequestBody?.(args) ?? args;
  }

  async doGenerate(
    options: Parameters<LanguageModelV2['doGenerate']>[0],
  ): Promise<Awaited<ReturnType<LanguageModelV2['doGenerate']>>> {
    const { args, warnings, betas, jsonResponseTool } =
      await this.getArgs(options);

    const {
      responseHeaders,
      value: response,
      rawValue: rawResponse,
    } = await postJsonToApi({
      url: this.buildRequestUrl(false),
      headers: await this.getHeaders({ betas, headers: options.headers }),
      body: this.transformRequestBody(args),
      failedResponseHandler: anthropicFailedResponseHandler,
      successfulResponseHandler: createJsonResponseHandler(
        anthropicMessagesResponseSchema,
      ),
      abortSignal: options.abortSignal,
      fetch: this.config.fetch,
    });

    const content: Array<LanguageModelV2Content> = [];

    // map response content to content array
    for (const part of response.content) {
      switch (part.type) {
        case 'text': {
          // when a json response tool is used, the tool call is returned as text,
          // so we ignore the text content:
          if (jsonResponseTool == null) {
            content.push({ type: 'text', text: part.text });
          }
          break;
        }
        case 'thinking': {
          content.push({
            type: 'reasoning',
            text: part.thinking,
            providerMetadata: {
              anthropic: {
                signature: part.signature,
              } satisfies AnthropicReasoningMetadata,
            },
          });
          break;
        }
        case 'redacted_thinking': {
          content.push({
            type: 'reasoning',
            text: '',
            providerMetadata: {
              anthropic: {
                redactedData: part.data,
              } satisfies AnthropicReasoningMetadata,
            },
          });
          break;
        }
        case 'tool_use': {
          content.push(
            // when a json response tool is used, the tool call becomes the text:
            jsonResponseTool != null
              ? {
                  type: 'text',
                  text: JSON.stringify(part.input),
                }
              : {
                  type: 'tool-call' as const,
                  toolCallType: 'function',
                  toolCallId: part.id,
                  toolName: part.name,
                  args: JSON.stringify(part.input),
                },
          );

          break;
        }
        case 'server_tool_use': {
          continue;
        }
        case 'web_search_tool_result': {
          if (Array.isArray(part.content)) {
            for (const result of part.content) {
              if (result.type === 'web_search_result') {
                content.push({
                  type: 'source',
                  sourceType: 'url',
                  id: this.generateId(),
                  url: result.url,
                  title: result.title,
                  providerMetadata: {
                    anthropic: {
                      encryptedContent: result.encrypted_content,
                      pageAge: result.page_age ?? null,
                    },
                  },
                });
              }
            }
          } else if (part.content.type === 'web_search_tool_result_error') {
            throw new APICallError({
              message: `Web search failed: ${part.content.error_code}`,
              url: 'web_search_api',
              requestBodyValues: { tool_use_id: part.tool_use_id },
              data: { error_code: part.content.error_code },
            });
          }
          break;
        }
      }
    }

    return {
      content,
      finishReason: mapAnthropicStopReason({
        finishReason: response.stop_reason,
        isJsonResponseFromTool: jsonResponseTool != null,
      }),
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        totalTokens: response.usage.input_tokens + response.usage.output_tokens,
        cachedInputTokens: response.usage.cache_read_input_tokens ?? undefined,
      },
      request: { body: args },
      response: {
        id: response.id ?? undefined,
        modelId: response.model ?? undefined,
        headers: responseHeaders,
        body: rawResponse,
      },
      warnings,
      providerMetadata: {
        anthropic: {
          cacheCreationInputTokens:
            response.usage.cache_creation_input_tokens ?? null,
        },
      },
    };
  }

  async doStream(
    options: Parameters<LanguageModelV2['doStream']>[0],
  ): Promise<Awaited<ReturnType<LanguageModelV2['doStream']>>> {
    const { args, warnings, betas, jsonResponseTool } =
      await this.getArgs(options);

    const body = { ...args, stream: true };

    const { responseHeaders, value: response } = await postJsonToApi({
      url: this.buildRequestUrl(true),
      headers: await this.getHeaders({ betas, headers: options.headers }),
      body: this.transformRequestBody(body),
      failedResponseHandler: anthropicFailedResponseHandler,
      successfulResponseHandler: createEventSourceResponseHandler(
        anthropicMessagesChunkSchema,
      ),
      abortSignal: options.abortSignal,
      fetch: this.config.fetch,
    });

    let finishReason: LanguageModelV2FinishReason = 'unknown';
    const usage: LanguageModelV2Usage = {
      inputTokens: undefined,
      outputTokens: undefined,
      totalTokens: undefined,
    };

    const toolCallContentBlocks: Record<
      number,
      {
        toolCallId: string;
        toolName: string;
        jsonText: string;
      }
    > = {};

    let providerMetadata: SharedV2ProviderMetadata | undefined = undefined;

    let blockType:
      | 'text'
      | 'thinking'
      | 'tool_use'
      | 'redacted_thinking'
      | 'server_tool_use'
      | 'web_search_tool_result'
      | undefined = undefined;

    const config = this.config;
    const generateId = this.generateId;

    return {
      stream: response.pipeThrough(
        new TransformStream<
          ParseResult<z.infer<typeof anthropicMessagesChunkSchema>>,
          LanguageModelV2StreamPart
        >({
          start(controller) {
            controller.enqueue({ type: 'stream-start', warnings });
          },

          transform(chunk, controller) {
            if (!chunk.success) {
              controller.enqueue({ type: 'error', error: chunk.error });
              return;
            }

            const value = chunk.value;

            switch (value.type) {
              case 'ping': {
                return; // ignored
              }

              case 'content_block_start': {
                const contentBlockType = value.content_block.type;

                blockType = contentBlockType;

                switch (contentBlockType) {
                  case 'text':
                  case 'thinking': {
                    return; // ignored
                  }

                  case 'redacted_thinking': {
                    controller.enqueue({
                      type: 'reasoning',
                      text: '',
                      providerMetadata: {
                        anthropic: {
                          redactedData: value.content_block.data,
                        } satisfies AnthropicReasoningMetadata,
                      },
                    });
                    controller.enqueue({ type: 'reasoning-part-finish' });
                    return;
                  }

                  case 'tool_use': {
                    toolCallContentBlocks[value.index] = {
                      toolCallId: value.content_block.id,
                      toolName: value.content_block.name,
                      jsonText: '',
                    };
                    return;
                  }

                  case 'server_tool_use': {
                    // server_tool_use is just metadata about the tool usage
                    // We don't generate synthetic content for it
                    return;
                  }

                  case 'web_search_tool_result': {
                    if (Array.isArray(value.content_block.content)) {
                      for (const result of value.content_block.content) {
                        if (result.type === 'web_search_result') {
                          controller.enqueue({
                            type: 'source',
                            sourceType: 'url',
                            id: generateId(),
                            url: result.url,
                            title: result.title,
                            providerMetadata: {
                              anthropic: {
                                encryptedContent: result.encrypted_content,
                                pageAge: result.page_age ?? null,
                              },
                            },
                          });
                        }
                      }
                    } else if (
                      value.content_block.content.type ===
                      'web_search_tool_result_error'
                    ) {
                      controller.enqueue({
                        type: 'error',
                        error: {
                          type: 'web-search-error',
                          message: `Web search failed: ${value.content_block.content.error_code}`,
                          code: value.content_block.content.error_code,
                        },
                      });
                    }
                    return;
                  }

                  default: {
                    const _exhaustiveCheck: never = contentBlockType;
                    throw new Error(
                      `Unsupported content block type: ${_exhaustiveCheck}`,
                    );
                  }
                }
              }

              case 'content_block_stop': {
                // when finishing a tool call block, send the full tool call:
                if (toolCallContentBlocks[value.index] != null) {
                  const contentBlock = toolCallContentBlocks[value.index];

                  // when a json response tool is used, the tool call is returned as text,
                  // so we ignore the tool call content:
                  if (jsonResponseTool == null) {
                    controller.enqueue({
                      type: 'tool-call',
                      toolCallType: 'function',
                      toolCallId: contentBlock.toolCallId,
                      toolName: contentBlock.toolName,
                      args: contentBlock.jsonText,
                    });
                  }

                  delete toolCallContentBlocks[value.index];
                }

                blockType = undefined; // reset block type

                return;
              }

              case 'content_block_delta': {
                const deltaType = value.delta.type;
                switch (deltaType) {
                  case 'text_delta': {
                    // when a json response tool is used, the tool call is returned as text,
                    // so we ignore the text content:
                    if (jsonResponseTool != null) {
                      return;
                    }

                    controller.enqueue({
                      type: 'text',
                      text: value.delta.text,
                    });

                    return;
                  }

                  case 'thinking_delta': {
                    controller.enqueue({
                      type: 'reasoning',
                      text: value.delta.thinking,
                    });

                    return;
                  }

                  case 'signature_delta': {
                    // signature are only supported on thinking blocks:
                    if (blockType === 'thinking') {
                      controller.enqueue({
                        type: 'reasoning',
                        text: '',
                        providerMetadata: {
                          anthropic: {
                            signature: value.delta.signature,
                          } satisfies AnthropicReasoningMetadata,
                        },
                      });
                      controller.enqueue({ type: 'reasoning-part-finish' });
                    }

                    return;
                  }

                  case 'input_json_delta': {
                    const contentBlock = toolCallContentBlocks[value.index];

                    if (!contentBlock) {
                      return;
                    }

                    controller.enqueue(
                      jsonResponseTool != null
                        ? {
                            type: 'text',
                            text: value.delta.partial_json,
                          }
                        : {
                            type: 'tool-call-delta',
                            toolCallType: 'function',
                            toolCallId: contentBlock.toolCallId,
                            toolName: contentBlock.toolName,
                            argsTextDelta: value.delta.partial_json,
                          },
                    );

                    contentBlock.jsonText += value.delta.partial_json;

                    return;
                  }

                  case 'citations_delta': {
                    // citations are included in the final web_search_tool_result content block
                    // we don't need to process them separately in the stream
                    return;
                  }

                  default: {
                    const _exhaustiveCheck: never = deltaType;
                    throw new Error(
                      `Unsupported delta type: ${_exhaustiveCheck}`,
                    );
                  }
                }
              }

              case 'message_start': {
                usage.inputTokens = value.message.usage.input_tokens;
                usage.cachedInputTokens =
                  value.message.usage.cache_read_input_tokens ?? undefined;

                providerMetadata = {
                  anthropic: {
                    cacheCreationInputTokens:
                      value.message.usage.cache_creation_input_tokens ?? null,
                  },
                };

                controller.enqueue({
                  type: 'response-metadata',
                  id: value.message.id ?? undefined,
                  modelId: value.message.model ?? undefined,
                });

                return;
              }

              case 'message_delta': {
                usage.outputTokens = value.usage.output_tokens;
                usage.totalTokens =
                  (usage.inputTokens ?? 0) + (value.usage.output_tokens ?? 0);

                finishReason = mapAnthropicStopReason({
                  finishReason: value.delta.stop_reason,
                  isJsonResponseFromTool: jsonResponseTool != null,
                });
                return;
              }

              case 'message_stop': {
                controller.enqueue({
                  type: 'finish',
                  finishReason,
                  usage,
                  providerMetadata,
                });
                return;
              }

              case 'error': {
                controller.enqueue({ type: 'error', error: value.error });
                return;
              }

              default: {
                const _exhaustiveCheck: never = value;
                throw new Error(`Unsupported chunk type: ${_exhaustiveCheck}`);
              }
            }
          },
        }),
      ),
      request: { body },
      response: { headers: responseHeaders },
    };
  }
}

// limited version of the schema, focussed on what is needed for the implementation
// this approach limits breakages when the API changes and increases efficiency
const anthropicMessagesResponseSchema = z.object({
  type: z.literal('message'),
  id: z.string().nullish(),
  model: z.string().nullish(),
  content: z.array(
    z.discriminatedUnion('type', [
      z.object({
        type: z.literal('text'),
        text: z.string(),
      }),
      z.object({
        type: z.literal('thinking'),
        thinking: z.string(),
        signature: z.string(),
      }),
      z.object({
        type: z.literal('redacted_thinking'),
        data: z.string(),
      }),
      z.object({
        type: z.literal('tool_use'),
        id: z.string(),
        name: z.string(),
        input: z.unknown(),
      }),
      z.object({
        type: z.literal('server_tool_use'),
        id: z.string(),
        name: z.string(),
        input: z.record(z.unknown()).nullish(),
      }),
      z.object({
        type: z.literal('web_search_tool_result'),
        tool_use_id: z.string(),
        content: z.union([
          z.array(
            z.object({
              type: z.literal('web_search_result'),
              url: z.string(),
              title: z.string(),
              encrypted_content: z.string(),
              page_age: z.string().nullish(),
            }),
          ),
          z.object({
            type: z.literal('web_search_tool_result_error'),
            error_code: z.string(),
          }),
        ]),
      }),
    ]),
  ),
  stop_reason: z.string().nullish(),
  usage: z.object({
    input_tokens: z.number(),
    output_tokens: z.number(),
    cache_creation_input_tokens: z.number().nullish(),
    cache_read_input_tokens: z.number().nullish(),
    server_tool_use: z
      .object({
        web_search_requests: z.number(),
      })
      .nullish(),
  }),
});

// limited version of the schema, focussed on what is needed for the implementation
// this approach limits breakages when the API changes and increases efficiency
const anthropicMessagesChunkSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('message_start'),
    message: z.object({
      id: z.string().nullish(),
      model: z.string().nullish(),
      usage: z.object({
        input_tokens: z.number(),
        output_tokens: z.number(),
        cache_creation_input_tokens: z.number().nullish(),
        cache_read_input_tokens: z.number().nullish(),
      }),
    }),
  }),
  z.object({
    type: z.literal('content_block_start'),
    index: z.number(),
    content_block: z.discriminatedUnion('type', [
      z.object({
        type: z.literal('text'),
        text: z.string(),
      }),
      z.object({
        type: z.literal('thinking'),
        thinking: z.string(),
      }),
      z.object({
        type: z.literal('tool_use'),
        id: z.string(),
        name: z.string(),
      }),
      z.object({
        type: z.literal('redacted_thinking'),
        data: z.string(),
      }),
      z.object({
        type: z.literal('server_tool_use'),
        id: z.string(),
        name: z.string(),
        input: z.record(z.unknown()).nullish(),
      }),
      z.object({
        type: z.literal('web_search_tool_result'),
        tool_use_id: z.string(),
        content: z.union([
          z.array(
            z.object({
              type: z.literal('web_search_result'),
              url: z.string(),
              title: z.string(),
              encrypted_content: z.string(),
              page_age: z.string().nullish(),
            }),
          ),
          z.object({
            type: z.literal('web_search_tool_result_error'),
            error_code: z.string(),
          }),
        ]),
      }),
    ]),
  }),
  z.object({
    type: z.literal('content_block_delta'),
    index: z.number(),
    delta: z.discriminatedUnion('type', [
      z.object({
        type: z.literal('input_json_delta'),
        partial_json: z.string(),
      }),
      z.object({
        type: z.literal('text_delta'),
        text: z.string(),
      }),
      z.object({
        type: z.literal('thinking_delta'),
        thinking: z.string(),
      }),
      z.object({
        type: z.literal('signature_delta'),
        signature: z.string(),
      }),
      z.object({
        type: z.literal('citations_delta'),
        citation: z.object({
          type: z.literal('web_search_result_location'),
          cited_text: z.string(),
          url: z.string(),
          title: z.string(),
          encrypted_index: z.string(),
        }),
      }),
    ]),
  }),
  z.object({
    type: z.literal('content_block_stop'),
    index: z.number(),
  }),
  z.object({
    type: z.literal('error'),
    error: z.object({
      type: z.string(),
      message: z.string(),
    }),
  }),
  z.object({
    type: z.literal('message_delta'),
    delta: z.object({ stop_reason: z.string().nullish() }),
    usage: z.object({ output_tokens: z.number() }),
  }),
  z.object({
    type: z.literal('message_stop'),
  }),
  z.object({
    type: z.literal('ping'),
  }),
]);

export const anthropicReasoningMetadataSchema = z.object({
  signature: z.string().optional(),
  redactedData: z.string().optional(),
});

export type AnthropicReasoningMetadata = z.infer<
  typeof anthropicReasoningMetadataSchema
>;
