import {
  APICallError,
  LanguageModelV3,
  SharedV3Warning,
  LanguageModelV3Content,
  LanguageModelV3FinishReason,
  LanguageModelV3ProviderTool,
  LanguageModelV3StreamPart,
  LanguageModelV3Usage,
  SharedV3ProviderMetadata,
  JSONValue,
} from '@ai-sdk/provider';
import {
  combineHeaders,
  createEventSourceResponseHandler,
  createJsonResponseHandler,
  createToolNameMapping,
  generateId,
  InferSchema,
  parseProviderOptions,
  ParseResult,
  postJsonToApi,
} from '@ai-sdk/provider-utils';
import { OpenAIConfig } from '../openai-config';
import { openaiFailedResponseHandler } from '../openai-error';
import {
  codeInterpreterInputSchema,
  codeInterpreterOutputSchema,
} from '../tool/code-interpreter';
import { fileSearchOutputSchema } from '../tool/file-search';
import { imageGenerationOutputSchema } from '../tool/image-generation';
import { localShellInputSchema } from '../tool/local-shell';
import { webSearchOutputSchema } from '../tool/web-search';
import { mcpOutputSchema } from '../tool/mcp';
import { convertToOpenAIResponsesInput } from './convert-to-openai-responses-input';
import { mapOpenAIResponseFinishReason } from './map-openai-responses-finish-reason';
import {
  OpenAIResponsesChunk,
  openaiResponsesChunkSchema,
  OpenAIResponsesIncludeOptions,
  OpenAIResponsesIncludeValue,
  OpenAIResponsesLogprobs,
  openaiResponsesResponseSchema,
  OpenAIResponsesWebSearchAction,
} from './openai-responses-api';
import {
  OpenAIResponsesModelId,
  openaiResponsesProviderOptionsSchema,
  TOP_LOGPROBS_MAX,
} from './openai-responses-options';
import { prepareResponsesTools } from './openai-responses-prepare-tools';
import { isReasoningModel as modelSupportsReasoning } from '../openai-is-reasoning-model';

export class OpenAIResponsesLanguageModel implements LanguageModelV3 {
  readonly specificationVersion = 'v3';

  readonly modelId: OpenAIResponsesModelId;

  private readonly config: OpenAIConfig;

  constructor(modelId: OpenAIResponsesModelId, config: OpenAIConfig) {
    this.modelId = modelId;
    this.config = config;
  }

  readonly supportedUrls: Record<string, RegExp[]> = {
    'image/*': [/^https?:\/\/.*$/],
    'application/pdf': [/^https?:\/\/.*$/],
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
  }: Parameters<LanguageModelV3['doGenerate']>[0]) {
    const warnings: SharedV3Warning[] = [];
    const modelConfig = getResponsesModelConfig(this.modelId);

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

    const openaiOptions = await parseProviderOptions({
      provider: 'openai',
      providerOptions,
      schema: openaiResponsesProviderOptionsSchema,
    });

    if (openaiOptions?.conversation && openaiOptions?.previousResponseId) {
      warnings.push({
        type: 'unsupported',
        feature: 'conversation',
        details: 'conversation and previousResponseId cannot be used together',
      });
    }

    const toolNameMapping = createToolNameMapping({
      tools,
      providerToolNames: {
        'openai.code_interpreter': 'code_interpreter',
        'openai.file_search': 'file_search',
        'openai.image_generation': 'image_generation',
        'openai.local_shell': 'local_shell',
        'openai.web_search': 'web_search',
        'openai.web_search_preview': 'web_search_preview',
        'openai.mcp': 'mcp',
      },
    });

    const { input, warnings: inputWarnings } =
      await convertToOpenAIResponsesInput({
        prompt,
        toolNameMapping,
        systemMessageMode: modelConfig.systemMessageMode,
        fileIdPrefixes: this.config.fileIdPrefixes,
        store: openaiOptions?.store ?? true,
        hasLocalShellTool: hasOpenAITool('openai.local_shell'),
      });

    warnings.push(...inputWarnings);

    const strictJsonSchema = openaiOptions?.strictJsonSchema ?? false;

    let include: OpenAIResponsesIncludeOptions = openaiOptions?.include;

    function addInclude(key: OpenAIResponsesIncludeValue) {
      if (include == null) {
        include = [key];
      } else if (!include.includes(key)) {
        include = [...include, key];
      }
    }

    function hasOpenAITool(id: string) {
      return (
        tools?.find(tool => tool.type === 'provider' && tool.id === id) != null
      );
    }

    // when logprobs are requested, automatically include them:
    const topLogprobs =
      typeof openaiOptions?.logprobs === 'number'
        ? openaiOptions?.logprobs
        : openaiOptions?.logprobs === true
          ? TOP_LOGPROBS_MAX
          : undefined;

    if (topLogprobs) {
      addInclude('message.output_text.logprobs');
    }

    // when a web search tool is present, automatically include the sources:
    const webSearchToolName = (
      tools?.find(
        tool =>
          tool.type === 'provider' &&
          (tool.id === 'openai.web_search' ||
            tool.id === 'openai.web_search_preview'),
      ) as LanguageModelV3ProviderTool | undefined
    )?.name;

    if (webSearchToolName) {
      addInclude('web_search_call.action.sources');
    }

    // when a code interpreter tool is present, automatically include the outputs:
    if (hasOpenAITool('openai.code_interpreter')) {
      addInclude('code_interpreter_call.outputs');
    }

    const store = openaiOptions?.store;

    // store defaults to true in the OpenAI responses API, so check for false exactly:
    if (store === false && modelConfig.isReasoningModel) {
      addInclude('reasoning.encrypted_content');
    }

    const baseArgs = {
      model: this.modelId,
      input,
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
      conversation: openaiOptions?.conversation,
      max_tool_calls: openaiOptions?.maxToolCalls,
      metadata: openaiOptions?.metadata,
      parallel_tool_calls: openaiOptions?.parallelToolCalls,
      previous_response_id: openaiOptions?.previousResponseId,
      store,
      user: openaiOptions?.user,
      instructions: openaiOptions?.instructions,
      service_tier: openaiOptions?.serviceTier,
      include,
      prompt_cache_key: openaiOptions?.promptCacheKey,
      prompt_cache_retention: openaiOptions?.promptCacheRetention,
      safety_identifier: openaiOptions?.safetyIdentifier,
      top_logprobs: topLogprobs,
      truncation: openaiOptions?.truncation,

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
    };

    if (modelConfig.isReasoningModel) {
      // remove unsupported settings for reasoning models
      // see https://platform.openai.com/docs/guides/reasoning#limitations
      if (baseArgs.temperature != null) {
        baseArgs.temperature = undefined;
        warnings.push({
          type: 'unsupported',
          feature: 'temperature',
          details: 'temperature is not supported for reasoning models',
        });
      }

      if (baseArgs.top_p != null) {
        baseArgs.top_p = undefined;
        warnings.push({
          type: 'unsupported',
          feature: 'topP',
          details: 'topP is not supported for reasoning models',
        });
      }
    } else {
      if (openaiOptions?.reasoningEffort != null) {
        warnings.push({
          type: 'unsupported',
          feature: 'reasoningEffort',
          details: 'reasoningEffort is not supported for non-reasoning models',
        });
      }

      if (openaiOptions?.reasoningSummary != null) {
        warnings.push({
          type: 'unsupported',
          feature: 'reasoningSummary',
          details: 'reasoningSummary is not supported for non-reasoning models',
        });
      }
    }

    // Validate flex processing support
    if (
      openaiOptions?.serviceTier === 'flex' &&
      !modelConfig.supportsFlexProcessing
    ) {
      warnings.push({
        type: 'unsupported',
        feature: 'serviceTier',
        details:
          'flex processing is only available for o3, o4-mini, and gpt-5 models',
      });
      // Remove from args if not supported
      delete (baseArgs as any).service_tier;
    }

    // Validate priority processing support
    if (
      openaiOptions?.serviceTier === 'priority' &&
      !modelConfig.supportsPriorityProcessing
    ) {
      warnings.push({
        type: 'unsupported',
        feature: 'serviceTier',
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
    } = await prepareResponsesTools({
      tools,
      toolChoice,
      strictJsonSchema,
    });

    return {
      webSearchToolName,
      args: {
        ...baseArgs,
        tools: openaiTools,
        tool_choice: openaiToolChoice,
      },
      warnings: [...warnings, ...toolWarnings],
      store,
      toolNameMapping,
    };
  }

  async doGenerate(
    options: Parameters<LanguageModelV3['doGenerate']>[0],
  ): Promise<Awaited<ReturnType<LanguageModelV3['doGenerate']>>> {
    const {
      args: body,
      warnings,
      webSearchToolName,
      toolNameMapping,
    } = await this.getArgs(options);
    const url = this.config.url({
      path: '/responses',
      modelId: this.modelId,
    });

    const providerKey = this.config.provider.replace('.responses', ''); // can be 'openai' or 'azure'. provider is 'openai.responses' or 'azure.responses'.

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
        openaiResponsesResponseSchema,
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
    const logprobs: Array<OpenAIResponsesLogprobs> = [];

    // flag that checks if there have been client-side tool calls (not executed by openai)
    let hasFunctionCall = false;

    // map response content to content array (defined when there is no error)
    for (const part of response.output!) {
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
                [providerKey]: {
                  itemId: part.id,
                  reasoningEncryptedContent: part.encrypted_content ?? null,
                },
              },
            });
          }
          break;
        }

        case 'image_generation_call': {
          content.push({
            type: 'tool-call',
            toolCallId: part.id,
            toolName: toolNameMapping.toCustomToolName('image_generation'),
            input: '{}',
            providerExecuted: true,
          });

          content.push({
            type: 'tool-result',
            toolCallId: part.id,
            toolName: toolNameMapping.toCustomToolName('image_generation'),
            result: {
              result: part.result,
            } satisfies InferSchema<typeof imageGenerationOutputSchema>,
          });

          break;
        }

        case 'local_shell_call': {
          content.push({
            type: 'tool-call',
            toolCallId: part.call_id,
            toolName: toolNameMapping.toCustomToolName('local_shell'),
            input: JSON.stringify({
              action: part.action,
            } satisfies InferSchema<typeof localShellInputSchema>),
            providerMetadata: {
              [providerKey]: {
                itemId: part.id,
              },
            },
          });

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

            const providerMetadata: SharedV3ProviderMetadata[string] = {
              itemId: part.id,
              ...(contentPart.annotations.length > 0 && {
                annotations: contentPart.annotations,
              }),
            };

            content.push({
              type: 'text',
              text: contentPart.text,
              providerMetadata: {
                [providerKey]: providerMetadata,
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
                  title: annotation.quote ?? annotation.filename ?? 'Document',
                  filename: annotation.filename ?? annotation.file_id,
                  ...(annotation.file_id
                    ? {
                        providerMetadata: {
                          [providerKey]: {
                            fileId: annotation.file_id,
                          },
                        },
                      }
                    : {}),
                });
              } else if (annotation.type === 'container_file_citation') {
                content.push({
                  type: 'source',
                  sourceType: 'document',
                  id: this.config.generateId?.() ?? generateId(),
                  mediaType: 'text/plain',
                  title:
                    annotation.filename ?? annotation.file_id ?? 'Document',
                  filename: annotation.filename ?? annotation.file_id,
                  providerMetadata: {
                    [providerKey]: {
                      fileId: annotation.file_id,
                      containerId: annotation.container_id,
                      ...(annotation.index != null
                        ? { index: annotation.index }
                        : {}),
                    },
                  },
                });
              } else if (annotation.type === 'file_path') {
                content.push({
                  type: 'source',
                  sourceType: 'document',
                  id: this.config.generateId?.() ?? generateId(),
                  mediaType: 'application/octet-stream',
                  title: annotation.file_id,
                  filename: annotation.file_id,
                  providerMetadata: {
                    [providerKey]: {
                      fileId: annotation.file_id,
                      ...(annotation.index != null
                        ? { index: annotation.index }
                        : {}),
                    },
                  },
                });
              }
            }
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
              [providerKey]: {
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
            toolName: toolNameMapping.toCustomToolName(
              webSearchToolName ?? 'web_search',
            ),
            input: JSON.stringify({}),
            providerExecuted: true,
          });

          content.push({
            type: 'tool-result',
            toolCallId: part.id,
            toolName: toolNameMapping.toCustomToolName(
              webSearchToolName ?? 'web_search',
            ),
            result: mapWebSearchOutput(part.action),
          });

          break;
        }

        case 'mcp_call': {
          content.push({
            type: 'tool-call',
            toolCallId: part.id,
            toolName: toolNameMapping.toCustomToolName('mcp'),
            input: JSON.stringify({}),
            providerExecuted: true,
          });

          content.push({
            type: 'tool-result',
            toolCallId: part.id,
            toolName: toolNameMapping.toCustomToolName('mcp'),
            result: {
              type: 'call',
              serverLabel: part.server_label,
              name: part.name,
              arguments: part.arguments,
              ...(part.output != null ? { output: part.output } : {}),
              ...(part.error != null
                ? { error: part.error as unknown as JSONValue }
                : {}),
            } satisfies InferSchema<typeof mcpOutputSchema>,
          });
          break;
        }

        case 'mcp_list_tools': {
          content.push({
            type: 'tool-call',
            toolCallId: part.id,
            toolName: toolNameMapping.toCustomToolName('mcp'),
            input: JSON.stringify({}),
            providerExecuted: true,
          });

          content.push({
            type: 'tool-result',
            toolCallId: part.id,
            toolName: toolNameMapping.toCustomToolName('mcp'),
            result: {
              type: 'listTools',
              serverLabel: part.server_label,
              tools: part.tools.map(t => ({
                name: t.name,
                description: t.description ?? undefined,
                inputSchema: t.input_schema,
                annotations:
                  (t.annotations as Record<string, JSONValue> | undefined) ??
                  undefined,
              })),
              ...(part.error != null
                ? { error: part.error as unknown as JSONValue }
                : {}),
            } satisfies InferSchema<typeof mcpOutputSchema>,
          });
          break;
        }

        case 'mcp_approval_request': {
          content.push({
            type: 'tool-call',
            toolCallId: part.id,
            toolName: toolNameMapping.toCustomToolName('mcp'),
            input: JSON.stringify({}),
            providerExecuted: true,
          });

          content.push({
            type: 'tool-result',
            toolCallId: part.id,
            toolName: toolNameMapping.toCustomToolName('mcp'),
            result: {
              type: 'approvalRequest',
              serverLabel: part.server_label,
              name: part.name,
              arguments: part.arguments,
              approvalRequestId: part.approval_request_id,
            } satisfies InferSchema<typeof mcpOutputSchema>,
          });
          break;
        }

        case 'computer_call': {
          content.push({
            type: 'tool-call',
            toolCallId: part.id,
            toolName: toolNameMapping.toCustomToolName('computer_use'),
            input: '',
            providerExecuted: true,
          });

          content.push({
            type: 'tool-result',
            toolCallId: part.id,
            toolName: toolNameMapping.toCustomToolName('computer_use'),
            result: {
              type: 'computer_use_tool_result',
              status: part.status || 'completed',
            },
          });
          break;
        }

        case 'file_search_call': {
          content.push({
            type: 'tool-call',
            toolCallId: part.id,
            toolName: toolNameMapping.toCustomToolName('file_search'),
            input: '{}',
            providerExecuted: true,
          });

          content.push({
            type: 'tool-result',
            toolCallId: part.id,
            toolName: toolNameMapping.toCustomToolName('file_search'),
            result: {
              queries: part.queries,
              results:
                part.results?.map(result => ({
                  attributes: result.attributes,
                  fileId: result.file_id,
                  filename: result.filename,
                  score: result.score,
                  text: result.text,
                })) ?? null,
            } satisfies InferSchema<typeof fileSearchOutputSchema>,
          });
          break;
        }

        case 'code_interpreter_call': {
          content.push({
            type: 'tool-call',
            toolCallId: part.id,
            toolName: toolNameMapping.toCustomToolName('code_interpreter'),
            input: JSON.stringify({
              code: part.code,
              containerId: part.container_id,
            } satisfies InferSchema<typeof codeInterpreterInputSchema>),
            providerExecuted: true,
          });

          content.push({
            type: 'tool-result',
            toolCallId: part.id,
            toolName: toolNameMapping.toCustomToolName('code_interpreter'),
            result: {
              outputs: part.outputs,
            } satisfies InferSchema<typeof codeInterpreterOutputSchema>,
          });
          break;
        }
      }
    }

    const providerMetadata: SharedV3ProviderMetadata = {
      [providerKey]: { responseId: response.id },
    };

    if (logprobs.length > 0) {
      providerMetadata[providerKey].logprobs = logprobs;
    }

    if (typeof response.service_tier === 'string') {
      providerMetadata[providerKey].serviceTier = response.service_tier;
    }

    const usage = response.usage!; // defined when there is no error

    return {
      content,
      finishReason: mapOpenAIResponseFinishReason({
        finishReason: response.incomplete_details?.reason,
        hasFunctionCall,
      }),
      usage: {
        inputTokens: usage.input_tokens,
        outputTokens: usage.output_tokens,
        totalTokens: usage.input_tokens + usage.output_tokens,
        reasoningTokens:
          usage.output_tokens_details?.reasoning_tokens ?? undefined,
        cachedInputTokens:
          usage.input_tokens_details?.cached_tokens ?? undefined,
      },
      request: { body },
      response: {
        id: response.id,
        timestamp: new Date(response.created_at! * 1000),
        modelId: response.model,
        headers: responseHeaders,
        body: rawResponse,
      },
      providerMetadata,
      warnings,
    };
  }

  async doStream(
    options: Parameters<LanguageModelV3['doStream']>[0],
  ): Promise<Awaited<ReturnType<LanguageModelV3['doStream']>>> {
    const {
      args: body,
      warnings,
      webSearchToolName,
      toolNameMapping,
      store,
    } = await this.getArgs(options);

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
    const providerKey = this.config.provider.replace('.responses', ''); // can be 'openai' or 'azure'. provider is 'openai.responses' or 'azure.responses'.

    let finishReason: LanguageModelV3FinishReason = 'unknown';
    const usage: LanguageModelV3Usage = {
      inputTokens: undefined,
      outputTokens: undefined,
      totalTokens: undefined,
    };
    const logprobs: Array<OpenAIResponsesLogprobs> = [];
    let responseId: string | null = null;
    const ongoingToolCalls: Record<
      number,
      | {
          toolName: string;
          toolCallId: string;
          codeInterpreter?: {
            containerId: string;
          };
        }
      | undefined
    > = {};

    // set annotations in 'text-end' part providerMetadata.
    const ongoingAnnotations: Array<
      Extract<
        OpenAIResponsesChunk,
        { type: 'response.output_text.annotation.added' }
      >['annotation']
    > = [];

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
          ParseResult<OpenAIResponsesChunk>,
          LanguageModelV3StreamPart
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
                  toolName: toolNameMapping.toCustomToolName(
                    webSearchToolName ?? 'web_search',
                  ),
                  toolCallId: value.item.id,
                };

                controller.enqueue({
                  type: 'tool-input-start',
                  id: value.item.id,
                  toolName: toolNameMapping.toCustomToolName(
                    webSearchToolName ?? 'web_search',
                  ),
                  providerExecuted: true,
                });

                controller.enqueue({
                  type: 'tool-input-end',
                  id: value.item.id,
                });

                controller.enqueue({
                  type: 'tool-call',
                  toolCallId: value.item.id,
                  toolName: toolNameMapping.toCustomToolName(
                    webSearchToolName ?? 'web_search',
                  ),
                  input: JSON.stringify({}),
                  providerExecuted: true,
                });
              } else if (value.item.type === 'computer_call') {
                ongoingToolCalls[value.output_index] = {
                  toolName: toolNameMapping.toCustomToolName('computer_use'),
                  toolCallId: value.item.id,
                };

                controller.enqueue({
                  type: 'tool-input-start',
                  id: value.item.id,
                  toolName: toolNameMapping.toCustomToolName('computer_use'),
                  providerExecuted: true,
                });
              } else if (value.item.type === 'code_interpreter_call') {
                ongoingToolCalls[value.output_index] = {
                  toolName:
                    toolNameMapping.toCustomToolName('code_interpreter'),
                  toolCallId: value.item.id,
                  codeInterpreter: {
                    containerId: value.item.container_id,
                  },
                };

                controller.enqueue({
                  type: 'tool-input-start',
                  id: value.item.id,
                  toolName:
                    toolNameMapping.toCustomToolName('code_interpreter'),
                  providerExecuted: true,
                });

                controller.enqueue({
                  type: 'tool-input-delta',
                  id: value.item.id,
                  delta: `{"containerId":"${value.item.container_id}","code":"`,
                });
              } else if (value.item.type === 'file_search_call') {
                controller.enqueue({
                  type: 'tool-call',
                  toolCallId: value.item.id,
                  toolName: toolNameMapping.toCustomToolName('file_search'),
                  input: '{}',
                  providerExecuted: true,
                });
              } else if (value.item.type === 'image_generation_call') {
                controller.enqueue({
                  type: 'tool-call',
                  toolCallId: value.item.id,
                  toolName:
                    toolNameMapping.toCustomToolName('image_generation'),
                  input: '{}',
                  providerExecuted: true,
                });
              } else if (
                value.item.type === 'mcp_call' ||
                value.item.type === 'mcp_list_tools' ||
                value.item.type === 'mcp_approval_request'
              ) {
                controller.enqueue({
                  type: 'tool-call',
                  toolCallId: value.item.id,
                  toolName: toolNameMapping.toCustomToolName('mcp'),
                  input: '{}',
                  providerExecuted: true,
                });
              } else if (value.item.type === 'message') {
                ongoingAnnotations.splice(0, ongoingAnnotations.length);
                controller.enqueue({
                  type: 'text-start',
                  id: value.item.id,
                  providerMetadata: {
                    [providerKey]: {
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
                    [providerKey]: {
                      itemId: value.item.id,
                      reasoningEncryptedContent:
                        value.item.encrypted_content ?? null,
                    },
                  },
                });
              }
            } else if (isResponseOutputItemDoneChunk(value)) {
              if (value.item.type === 'message') {
                controller.enqueue({
                  type: 'text-end',
                  id: value.item.id,
                  providerMetadata: {
                    [providerKey]: {
                      itemId: value.item.id,
                      ...(ongoingAnnotations.length > 0 && {
                        annotations: ongoingAnnotations,
                      }),
                    },
                  },
                });
              } else if (value.item.type === 'function_call') {
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
                    [providerKey]: {
                      itemId: value.item.id,
                    },
                  },
                });
              } else if (value.item.type === 'web_search_call') {
                ongoingToolCalls[value.output_index] = undefined;

                controller.enqueue({
                  type: 'tool-result',
                  toolCallId: value.item.id,
                  toolName: toolNameMapping.toCustomToolName(
                    webSearchToolName ?? 'web_search',
                  ),
                  result: mapWebSearchOutput(value.item.action),
                });
              } else if (value.item.type === 'computer_call') {
                ongoingToolCalls[value.output_index] = undefined;

                controller.enqueue({
                  type: 'tool-input-end',
                  id: value.item.id,
                });

                controller.enqueue({
                  type: 'tool-call',
                  toolCallId: value.item.id,
                  toolName: toolNameMapping.toCustomToolName('computer_use'),
                  input: '',
                  providerExecuted: true,
                });

                controller.enqueue({
                  type: 'tool-result',
                  toolCallId: value.item.id,
                  toolName: toolNameMapping.toCustomToolName('computer_use'),
                  result: {
                    type: 'computer_use_tool_result',
                    status: value.item.status || 'completed',
                  },
                });
              } else if (value.item.type === 'file_search_call') {
                ongoingToolCalls[value.output_index] = undefined;

                controller.enqueue({
                  type: 'tool-result',
                  toolCallId: value.item.id,
                  toolName: toolNameMapping.toCustomToolName('file_search'),
                  result: {
                    queries: value.item.queries,
                    results:
                      value.item.results?.map(result => ({
                        attributes: result.attributes,
                        fileId: result.file_id,
                        filename: result.filename,
                        score: result.score,
                        text: result.text,
                      })) ?? null,
                  } satisfies InferSchema<typeof fileSearchOutputSchema>,
                });
              } else if (value.item.type === 'code_interpreter_call') {
                ongoingToolCalls[value.output_index] = undefined;

                controller.enqueue({
                  type: 'tool-result',
                  toolCallId: value.item.id,
                  toolName:
                    toolNameMapping.toCustomToolName('code_interpreter'),
                  result: {
                    outputs: value.item.outputs,
                  } satisfies InferSchema<typeof codeInterpreterOutputSchema>,
                });
              } else if (value.item.type === 'image_generation_call') {
                controller.enqueue({
                  type: 'tool-result',
                  toolCallId: value.item.id,
                  toolName:
                    toolNameMapping.toCustomToolName('image_generation'),
                  result: {
                    result: value.item.result,
                  } satisfies InferSchema<typeof imageGenerationOutputSchema>,
                });
              } else if (value.item.type === 'mcp_call') {
                ongoingToolCalls[value.output_index] = undefined;

                controller.enqueue({
                  type: 'tool-result',
                  toolCallId: value.item.id,
                  toolName: toolNameMapping.toCustomToolName('mcp'),
                  result: {
                    type: 'call',
                    serverLabel: value.item.server_label,
                    name: value.item.name,
                    arguments: value.item.arguments,
                    ...(value.item.output != null
                      ? { output: value.item.output }
                      : {}),
                    ...(value.item.error != null
                      ? { error: value.item.error as unknown as JSONValue }
                      : {}),
                  } satisfies InferSchema<typeof mcpOutputSchema>,
                });
              } else if (value.item.type === 'mcp_list_tools') {
                ongoingToolCalls[value.output_index] = undefined;

                controller.enqueue({
                  type: 'tool-result',
                  toolCallId: value.item.id,
                  toolName: toolNameMapping.toCustomToolName('mcp'),
                  result: {
                    type: 'listTools',
                    serverLabel: value.item.server_label,
                    tools: value.item.tools.map(t => ({
                      name: t.name,
                      description: t.description ?? undefined,
                      inputSchema: t.input_schema,
                      annotations:
                        (t.annotations as
                          | Record<string, JSONValue>
                          | undefined) ?? undefined,
                    })),
                    ...(value.item.error != null
                      ? { error: value.item.error as unknown as JSONValue }
                      : {}),
                  } satisfies InferSchema<typeof mcpOutputSchema>,
                });
              } else if (value.item.type === 'mcp_approval_request') {
                ongoingToolCalls[value.output_index] = undefined;

                controller.enqueue({
                  type: 'tool-result',
                  toolCallId: value.item.id,
                  toolName: toolNameMapping.toCustomToolName('mcp'),
                  result: {
                    type: 'approvalRequest',
                    serverLabel: value.item.server_label,
                    name: value.item.name,
                    arguments: value.item.arguments,
                    approvalRequestId: value.item.approval_request_id,
                  } satisfies InferSchema<typeof mcpOutputSchema>,
                });
              } else if (value.item.type === 'local_shell_call') {
                ongoingToolCalls[value.output_index] = undefined;

                controller.enqueue({
                  type: 'tool-call',
                  toolCallId: value.item.call_id,
                  toolName: toolNameMapping.toCustomToolName('local_shell'),
                  input: JSON.stringify({
                    action: {
                      type: 'exec',
                      command: value.item.action.command,
                      timeoutMs: value.item.action.timeout_ms,
                      user: value.item.action.user,
                      workingDirectory: value.item.action.working_directory,
                      env: value.item.action.env,
                    },
                  } satisfies InferSchema<typeof localShellInputSchema>),
                  providerMetadata: {
                    [providerKey]: { itemId: value.item.id },
                  },
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
                      [providerKey]: {
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
            } else if (isResponseImageGenerationCallPartialImageChunk(value)) {
              controller.enqueue({
                type: 'tool-result',
                toolCallId: value.item_id,
                toolName: toolNameMapping.toCustomToolName('image_generation'),
                result: {
                  result: value.partial_image_b64,
                } satisfies InferSchema<typeof imageGenerationOutputSchema>,
                preliminary: true,
              });
            } else if (isResponseCodeInterpreterCallCodeDeltaChunk(value)) {
              const toolCall = ongoingToolCalls[value.output_index];

              if (toolCall != null) {
                controller.enqueue({
                  type: 'tool-input-delta',
                  id: toolCall.toolCallId,
                  // The delta is code, which is embedding in a JSON string.
                  // To escape it, we use JSON.stringify and slice to remove the outer quotes.
                  delta: JSON.stringify(value.delta).slice(1, -1),
                });
              }
            } else if (isResponseCodeInterpreterCallCodeDoneChunk(value)) {
              const toolCall = ongoingToolCalls[value.output_index];

              if (toolCall != null) {
                controller.enqueue({
                  type: 'tool-input-delta',
                  id: toolCall.toolCallId,
                  delta: '"}',
                });

                controller.enqueue({
                  type: 'tool-input-end',
                  id: toolCall.toolCallId,
                });

                // immediately send the tool call after the input end:
                controller.enqueue({
                  type: 'tool-call',
                  toolCallId: toolCall.toolCallId,
                  toolName:
                    toolNameMapping.toCustomToolName('code_interpreter'),
                  input: JSON.stringify({
                    code: value.code,
                    containerId: toolCall.codeInterpreter!.containerId,
                  } satisfies InferSchema<typeof codeInterpreterInputSchema>),
                  providerExecuted: true,
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

              if (options.providerOptions?.openai?.logprobs && value.logprobs) {
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
                      providerMetadata: {
                        [providerKey]: { itemId: value.item_id },
                      },
                    });
                    activeReasoningPart.summaryParts[summaryIndex] =
                      'concluded';
                  }
                }

                controller.enqueue({
                  type: 'reasoning-start',
                  id: `${value.item_id}:${value.summary_index}`,
                  providerMetadata: {
                    [providerKey]: {
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
                  [providerKey]: {
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
                    [providerKey]: { itemId: value.item_id },
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
              finishReason = mapOpenAIResponseFinishReason({
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
            } else if (isResponseAnnotationAddedChunk(value)) {
              ongoingAnnotations.push(value.annotation);
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
                  title:
                    value.annotation.quote ??
                    value.annotation.filename ??
                    'Document',
                  filename:
                    value.annotation.filename ?? value.annotation.file_id,
                  ...(value.annotation.file_id
                    ? {
                        providerMetadata: {
                          [providerKey]: {
                            fileId: value.annotation.file_id,
                          },
                        },
                      }
                    : {}),
                });
              } else if (value.annotation.type === 'container_file_citation') {
                controller.enqueue({
                  type: 'source',
                  sourceType: 'document',
                  id: self.config.generateId?.() ?? generateId(),
                  mediaType: 'text/plain',
                  title:
                    value.annotation.filename ??
                    value.annotation.file_id ??
                    'Document',
                  filename:
                    value.annotation.filename ?? value.annotation.file_id,
                  providerMetadata: {
                    [providerKey]: {
                      fileId: value.annotation.file_id,
                      containerId: value.annotation.container_id,
                      ...(value.annotation.index != null
                        ? { index: value.annotation.index }
                        : {}),
                    },
                  },
                });
              } else if (value.annotation.type === 'file_path') {
                controller.enqueue({
                  type: 'source',
                  sourceType: 'document',
                  id: self.config.generateId?.() ?? generateId(),
                  mediaType: 'application/octet-stream',
                  title: value.annotation.file_id,
                  filename: value.annotation.file_id,
                  providerMetadata: {
                    [providerKey]: {
                      fileId: value.annotation.file_id,
                      ...(value.annotation.index != null
                        ? { index: value.annotation.index }
                        : {}),
                    },
                  },
                });
              }
            } else if (isErrorChunk(value)) {
              controller.enqueue({ type: 'error', error: value });
            }
          },

          flush(controller) {
            const providerMetadata: SharedV3ProviderMetadata = {
              [providerKey]: {
                responseId,
              },
            };

            if (logprobs.length > 0) {
              providerMetadata[providerKey].logprobs = logprobs;
            }

            if (serviceTier !== undefined) {
              providerMetadata[providerKey].serviceTier = serviceTier;
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
  chunk: OpenAIResponsesChunk,
): chunk is OpenAIResponsesChunk & { type: 'response.output_text.delta' } {
  return chunk.type === 'response.output_text.delta';
}

function isResponseOutputItemDoneChunk(
  chunk: OpenAIResponsesChunk,
): chunk is OpenAIResponsesChunk & { type: 'response.output_item.done' } {
  return chunk.type === 'response.output_item.done';
}

function isResponseFinishedChunk(
  chunk: OpenAIResponsesChunk,
): chunk is OpenAIResponsesChunk & {
  type: 'response.completed' | 'response.incomplete';
} {
  return (
    chunk.type === 'response.completed' || chunk.type === 'response.incomplete'
  );
}

function isResponseCreatedChunk(
  chunk: OpenAIResponsesChunk,
): chunk is OpenAIResponsesChunk & { type: 'response.created' } {
  return chunk.type === 'response.created';
}

function isResponseFunctionCallArgumentsDeltaChunk(
  chunk: OpenAIResponsesChunk,
): chunk is OpenAIResponsesChunk & {
  type: 'response.function_call_arguments.delta';
} {
  return chunk.type === 'response.function_call_arguments.delta';
}
function isResponseImageGenerationCallPartialImageChunk(
  chunk: OpenAIResponsesChunk,
): chunk is OpenAIResponsesChunk & {
  type: 'response.image_generation_call.partial_image';
} {
  return chunk.type === 'response.image_generation_call.partial_image';
}

function isResponseCodeInterpreterCallCodeDeltaChunk(
  chunk: OpenAIResponsesChunk,
): chunk is OpenAIResponsesChunk & {
  type: 'response.code_interpreter_call_code.delta';
} {
  return chunk.type === 'response.code_interpreter_call_code.delta';
}

function isResponseCodeInterpreterCallCodeDoneChunk(
  chunk: OpenAIResponsesChunk,
): chunk is OpenAIResponsesChunk & {
  type: 'response.code_interpreter_call_code.done';
} {
  return chunk.type === 'response.code_interpreter_call_code.done';
}

function isResponseOutputItemAddedChunk(
  chunk: OpenAIResponsesChunk,
): chunk is OpenAIResponsesChunk & { type: 'response.output_item.added' } {
  return chunk.type === 'response.output_item.added';
}

function isResponseAnnotationAddedChunk(
  chunk: OpenAIResponsesChunk,
): chunk is OpenAIResponsesChunk & {
  type: 'response.output_text.annotation.added';
} {
  return chunk.type === 'response.output_text.annotation.added';
}

function isErrorChunk(
  chunk: OpenAIResponsesChunk,
): chunk is OpenAIResponsesChunk & { type: 'error' } {
  return chunk.type === 'error';
}

type ResponsesModelConfig = {
  isReasoningModel: boolean;
  systemMessageMode: 'remove' | 'system' | 'developer';
  supportsFlexProcessing: boolean;
  supportsPriorityProcessing: boolean;
};

function getResponsesModelConfig(modelId: string): ResponsesModelConfig {
  const supportsFlexProcessing =
    modelId.startsWith('o3') ||
    modelId.startsWith('o4-mini') ||
    (modelId.startsWith('gpt-5') && !modelId.startsWith('gpt-5-chat'));
  const supportsPriorityProcessing =
    modelId.startsWith('gpt-4') ||
    modelId.startsWith('gpt-5-mini') ||
    (modelId.startsWith('gpt-5') &&
      !modelId.startsWith('gpt-5-nano') &&
      !modelId.startsWith('gpt-5-chat')) ||
    modelId.startsWith('o3') ||
    modelId.startsWith('o4-mini');
  const isReasoningModel = modelSupportsReasoning(modelId);
  const systemMessageMode = isReasoningModel ? 'developer' : 'system';

  return {
    systemMessageMode,
    supportsFlexProcessing,
    supportsPriorityProcessing,
    isReasoningModel,
  };
}

function mapWebSearchOutput(
  action: OpenAIResponsesWebSearchAction,
): InferSchema<typeof webSearchOutputSchema> {
  switch (action.type) {
    case 'search':
      return {
        action: { type: 'search', query: action.query ?? undefined },
        // include sources when provided by the Responses API (behind include flag)
        ...(action.sources != null && { sources: action.sources }),
      };
    case 'open_page':
      return { action: { type: 'openPage', url: action.url } };
    case 'find':
      return {
        action: { type: 'find', url: action.url, pattern: action.pattern },
      };
  }
}
