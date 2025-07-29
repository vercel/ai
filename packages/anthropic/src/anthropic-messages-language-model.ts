import {
  JSONObject,
  JSONValue,
  LanguageModelV2,
  LanguageModelV2CallWarning,
  LanguageModelV2Content,
  LanguageModelV2FinishReason,
  LanguageModelV2FunctionTool,
  LanguageModelV2Prompt,
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
import { z } from 'zod/v4';
import { anthropicFailedResponseHandler } from './anthropic-error';
import {
  AnthropicMessagesModelId,
  anthropicProviderOptions,
} from './anthropic-messages-options';
import { prepareTools } from './anthropic-prepare-tools';
import { convertToAnthropicMessagesPrompt } from './convert-to-anthropic-messages-prompt';
import { mapAnthropicStopReason } from './map-anthropic-stop-reason';

const citationSchemas = {
  webSearchResult: z.object({
    type: z.literal('web_search_result_location'),
    cited_text: z.string(),
    url: z.string(),
    title: z.string(),
    encrypted_index: z.string(),
  }),
  pageLocation: z.object({
    type: z.literal('page_location'),
    cited_text: z.string(),
    document_index: z.number(),
    document_title: z.string().nullable(),
    start_page_number: z.number(),
    end_page_number: z.number(),
  }),
  charLocation: z.object({
    type: z.literal('char_location'),
    cited_text: z.string(),
    document_index: z.number(),
    document_title: z.string().nullable(),
    start_char_index: z.number(),
    end_char_index: z.number(),
  }),
};

const citationSchema = z.discriminatedUnion('type', [
  citationSchemas.webSearchResult,
  citationSchemas.pageLocation,
  citationSchemas.charLocation,
]);

const documentCitationSchema = z.discriminatedUnion('type', [
  citationSchemas.pageLocation,
  citationSchemas.charLocation,
]);

type Citation = z.infer<typeof citationSchema>;
export type DocumentCitation = z.infer<typeof documentCitationSchema>;
export type AnthropicProviderMetadata = SharedV2ProviderMetadata & {
  usage?: Record<string, JSONValue>;
};

function processCitation(
  citation: Citation,
  citationDocuments: Array<{
    title: string;
    filename?: string;
    mediaType: string;
  }>,
  generateId: () => string,
  onSource: (source: any) => void,
) {
  if (citation.type === 'page_location' || citation.type === 'char_location') {
    const source = createCitationSource(
      citation,
      citationDocuments,
      generateId,
    );
    if (source) {
      onSource(source);
    }
  }
}

function createCitationSource(
  citation: DocumentCitation,
  citationDocuments: Array<{
    title: string;
    filename?: string;
    mediaType: string;
  }>,
  generateId: () => string,
) {
  const documentInfo = citationDocuments[citation.document_index];
  if (!documentInfo) {
    return null;
  }

  const providerMetadata =
    citation.type === 'page_location'
      ? {
          citedText: citation.cited_text,
          startPageNumber: citation.start_page_number,
          endPageNumber: citation.end_page_number,
        }
      : {
          citedText: citation.cited_text,
          startCharIndex: citation.start_char_index,
          endCharIndex: citation.end_char_index,
        };

  return {
    type: 'source' as const,
    sourceType: 'document' as const,
    id: generateId(),
    mediaType: documentInfo.mediaType,
    title: citation.document_title ?? documentInfo.title,
    filename: documentInfo.filename,
    providerMetadata: {
      anthropic: providerMetadata,
    },
  };
}

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
            inputSchema: responseFormat.schema,
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
            disableParallelToolUse: anthropicOptions?.disableParallelToolUse,
          }
        : {
            tools: tools ?? [],
            toolChoice,
            disableParallelToolUse: anthropicOptions?.disableParallelToolUse,
          },
    );

    return {
      args: {
        ...baseArgs,
        tools: anthropicTools,
        tool_choice: anthropicToolChoice,
      },
      warnings: [...warnings, ...toolWarnings],
      betas: new Set([...messagesBetas, ...toolsBetas]),
      usesJsonResponseTool: jsonResponseTool != null,
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

  private extractCitationDocuments(prompt: LanguageModelV2Prompt): Array<{
    title: string;
    filename?: string;
    mediaType: string;
  }> {
    const isCitationPart = (part: {
      type: string;
      mediaType?: string;
      providerOptions?: { anthropic?: { citations?: { enabled?: boolean } } };
    }) => {
      if (part.type !== 'file') {
        return false;
      }

      if (
        part.mediaType !== 'application/pdf' &&
        part.mediaType !== 'text/plain'
      ) {
        return false;
      }

      const anthropic = part.providerOptions?.anthropic;
      const citationsConfig = anthropic?.citations as
        | { enabled?: boolean }
        | undefined;
      return citationsConfig?.enabled ?? false;
    };

    return prompt
      .filter(message => message.role === 'user')
      .flatMap(message => message.content)
      .filter(isCitationPart)
      .map(part => {
        // TypeScript knows this is a file part due to our filter
        const filePart = part as Extract<typeof part, { type: 'file' }>;
        return {
          title: filePart.filename ?? 'Untitled Document',
          filename: filePart.filename,
          mediaType: filePart.mediaType,
        };
      });
  }

  async doGenerate(
    options: Parameters<LanguageModelV2['doGenerate']>[0],
  ): Promise<Awaited<ReturnType<LanguageModelV2['doGenerate']>>> {
    const { args, warnings, betas, usesJsonResponseTool } =
      await this.getArgs(options);

    // Extract citation documents for response processing
    const citationDocuments = this.extractCitationDocuments(options.prompt);

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
          if (!usesJsonResponseTool) {
            content.push({ type: 'text', text: part.text });

            // Process citations if present
            if (part.citations) {
              for (const citation of part.citations) {
                processCitation(
                  citation,
                  citationDocuments,
                  this.generateId,
                  source => content.push(source),
                );
              }
            }
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
            usesJsonResponseTool
              ? {
                  type: 'text',
                  text: JSON.stringify(part.input),
                }
              : {
                  type: 'tool-call',
                  toolCallId: part.id,
                  toolName: part.name,
                  input: JSON.stringify(part.input),
                },
          );

          break;
        }
        case 'server_tool_use': {
          if (part.name === 'web_search') {
            content.push({
              type: 'tool-call',
              toolCallId: part.id,
              toolName: part.name,
              input: JSON.stringify(part.input),
              providerExecuted: true,
            });
          }

          break;
        }
        case 'web_search_tool_result': {
          if (Array.isArray(part.content)) {
            content.push({
              type: 'tool-result',
              toolCallId: part.tool_use_id,
              toolName: 'web_search',
              result: part.content.map(result => ({
                url: result.url,
                title: result.title,
                pageAge: result.page_age ?? null,
                encryptedContent: result.encrypted_content,
                type: result.type,
              })),
              providerExecuted: true,
            });

            for (const result of part.content) {
              content.push({
                type: 'source',
                sourceType: 'url',
                id: this.generateId(),
                url: result.url,
                title: result.title,
                providerMetadata: {
                  anthropic: {
                    pageAge: result.page_age ?? null,
                  },
                },
              });
            }
          } else {
            content.push({
              type: 'tool-result',
              toolCallId: part.tool_use_id,
              toolName: 'web_search',
              isError: true,
              result: {
                type: 'web_search_tool_result_error',
                errorCode: part.content.error_code,
              },
              providerExecuted: true,
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
        isJsonResponseFromTool: usesJsonResponseTool,
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
          usage: response.usage as JSONObject,
          cacheCreationInputTokens:
            response.usage.cache_creation_input_tokens ?? null,
        },
      },
    };
  }

  async doStream(
    options: Parameters<LanguageModelV2['doStream']>[0],
  ): Promise<Awaited<ReturnType<LanguageModelV2['doStream']>>> {
    const { args, warnings, betas, usesJsonResponseTool } =
      await this.getArgs(options);

    // Extract citation documents for response processing
    const citationDocuments = this.extractCitationDocuments(options.prompt);

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

    const contentBlocks: Record<
      number,
      | {
          type: 'tool-call';
          toolCallId: string;
          toolName: string;
          input: string;
          providerExecuted?: boolean;
        }
      | { type: 'text' | 'reasoning' }
    > = {};

    let providerMetadata: AnthropicProviderMetadata | undefined = undefined;

    let blockType:
      | 'text'
      | 'thinking'
      | 'tool_use'
      | 'redacted_thinking'
      | 'server_tool_use'
      | 'web_search_tool_result'
      | undefined = undefined;

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
            if (options.includeRawChunks) {
              controller.enqueue({ type: 'raw', rawValue: chunk.rawValue });
            }

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
                  case 'text': {
                    contentBlocks[value.index] = { type: 'text' };
                    controller.enqueue({
                      type: 'text-start',
                      id: String(value.index),
                    });
                    return;
                  }

                  case 'thinking': {
                    contentBlocks[value.index] = { type: 'reasoning' };
                    controller.enqueue({
                      type: 'reasoning-start',
                      id: String(value.index),
                    });
                    return;
                  }

                  case 'redacted_thinking': {
                    contentBlocks[value.index] = { type: 'reasoning' };
                    controller.enqueue({
                      type: 'reasoning-start',
                      id: String(value.index),
                      providerMetadata: {
                        anthropic: {
                          redactedData: value.content_block.data,
                        } satisfies AnthropicReasoningMetadata,
                      },
                    });
                    return;
                  }

                  case 'tool_use': {
                    contentBlocks[value.index] = usesJsonResponseTool
                      ? { type: 'text' }
                      : {
                          type: 'tool-call',
                          toolCallId: value.content_block.id,
                          toolName: value.content_block.name,
                          input: '',
                        };

                    controller.enqueue(
                      usesJsonResponseTool
                        ? { type: 'text-start', id: String(value.index) }
                        : {
                            type: 'tool-input-start',
                            id: value.content_block.id,
                            toolName: value.content_block.name,
                          },
                    );
                    return;
                  }

                  case 'server_tool_use': {
                    if (value.content_block.name === 'web_search') {
                      contentBlocks[value.index] = {
                        type: 'tool-call',
                        toolCallId: value.content_block.id,
                        toolName: value.content_block.name,
                        input: '',
                        providerExecuted: true,
                      };
                      controller.enqueue({
                        type: 'tool-input-start',
                        id: value.content_block.id,
                        toolName: value.content_block.name,
                        providerExecuted: true,
                      });
                    }

                    return;
                  }

                  case 'web_search_tool_result': {
                    const part = value.content_block;

                    if (Array.isArray(part.content)) {
                      controller.enqueue({
                        type: 'tool-result',
                        toolCallId: part.tool_use_id,
                        toolName: 'web_search',
                        result: part.content.map(result => ({
                          url: result.url,
                          title: result.title,
                          pageAge: result.page_age ?? null,
                          encryptedContent: result.encrypted_content,
                          type: result.type,
                        })),
                        providerExecuted: true,
                      });

                      for (const result of part.content) {
                        controller.enqueue({
                          type: 'source',
                          sourceType: 'url',
                          id: generateId(),
                          url: result.url,
                          title: result.title,
                          providerMetadata: {
                            anthropic: {
                              pageAge: result.page_age ?? null,
                            },
                          },
                        });
                      }
                    } else {
                      controller.enqueue({
                        type: 'tool-result',
                        toolCallId: part.tool_use_id,
                        toolName: 'web_search',
                        isError: true,
                        result: {
                          type: 'web_search_tool_result_error',
                          errorCode: part.content.error_code,
                        },
                        providerExecuted: true,
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
                if (contentBlocks[value.index] != null) {
                  const contentBlock = contentBlocks[value.index];

                  switch (contentBlock.type) {
                    case 'text': {
                      controller.enqueue({
                        type: 'text-end',
                        id: String(value.index),
                      });
                      break;
                    }

                    case 'reasoning': {
                      controller.enqueue({
                        type: 'reasoning-end',
                        id: String(value.index),
                      });
                      break;
                    }

                    case 'tool-call':
                      // when a json response tool is used, the tool call is returned as text,
                      // so we ignore the tool call content:
                      if (!usesJsonResponseTool) {
                        controller.enqueue({
                          type: 'tool-input-end',
                          id: contentBlock.toolCallId,
                        });
                        controller.enqueue(contentBlock);
                      }
                      break;
                  }

                  delete contentBlocks[value.index];
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
                    if (usesJsonResponseTool) {
                      return;
                    }

                    controller.enqueue({
                      type: 'text-delta',
                      id: String(value.index),
                      delta: value.delta.text,
                    });

                    return;
                  }

                  case 'thinking_delta': {
                    controller.enqueue({
                      type: 'reasoning-delta',
                      id: String(value.index),
                      delta: value.delta.thinking,
                    });

                    return;
                  }

                  case 'signature_delta': {
                    // signature are only supported on thinking blocks:
                    if (blockType === 'thinking') {
                      controller.enqueue({
                        type: 'reasoning-delta',
                        id: String(value.index),
                        delta: '',
                        providerMetadata: {
                          anthropic: {
                            signature: value.delta.signature,
                          } satisfies AnthropicReasoningMetadata,
                        },
                      });
                    }

                    return;
                  }

                  case 'input_json_delta': {
                    const contentBlock = contentBlocks[value.index];
                    const delta = value.delta.partial_json;

                    if (usesJsonResponseTool) {
                      if (contentBlock?.type !== 'text') {
                        return;
                      }

                      controller.enqueue({
                        type: 'text-delta',
                        id: String(value.index),
                        delta,
                      });
                    } else {
                      if (contentBlock?.type !== 'tool-call') {
                        return;
                      }

                      controller.enqueue({
                        type: 'tool-input-delta',
                        id: contentBlock.toolCallId,
                        delta,
                      });

                      contentBlock.input += delta;
                    }

                    return;
                  }

                  case 'citations_delta': {
                    const citation = value.delta.citation;

                    processCitation(
                      citation,
                      citationDocuments,
                      generateId,
                      source => controller.enqueue(source),
                    );
                    // Web search citations are handled in web_search_tool_result content block
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
                    usage: value.message.usage as JSONObject,
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
                  isJsonResponseFromTool: usesJsonResponseTool,
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
        citations: z.array(citationSchema).optional(),
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
        input: z.record(z.string(), z.unknown()).nullish(),
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
  usage: z.looseObject({
    input_tokens: z.number(),
    output_tokens: z.number(),
    cache_creation_input_tokens: z.number().nullish(),
    cache_read_input_tokens: z.number().nullish(),
  }),
});

// limited version of the schema, focused on what is needed for the implementation
// this approach limits breakages when the API changes and increases efficiency
const anthropicMessagesChunkSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('message_start'),
    message: z.object({
      id: z.string().nullish(),
      model: z.string().nullish(),
      usage: z.looseObject({
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
        input: z.record(z.string(), z.unknown()).nullish(),
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
        citation: citationSchema,
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
