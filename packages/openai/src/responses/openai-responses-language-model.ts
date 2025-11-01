import {
  APICallError,
  LanguageModelV3,
  LanguageModelV3CallWarning,
  LanguageModelV3Content,
  LanguageModelV3FinishReason,
  LanguageModelV3ProviderDefinedTool,
  LanguageModelV3StreamPart,
  LanguageModelV3Usage,
  SharedV3ProviderMetadata,
} from '@ai-sdk/provider';
import {
  combineHeaders,
  createEventSourceResponseHandler,
  createJsonResponseHandler,
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
  OpenaiResponsesOutputTextCodeInterpreterAnnotation,
} from './openai-responses-api';
import {
  OpenAIResponsesModelId,
  openaiResponsesProviderOptionsSchema,
  TOP_LOGPROBS_MAX,
} from './openai-responses-options';
import { prepareResponsesTools } from './openai-responses-prepare-tools';

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
    const warnings: LanguageModelV3CallWarning[] = [];
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

    const openaiOptions = await parseProviderOptions({
      provider: 'openai',
      providerOptions,
      schema: openaiResponsesProviderOptionsSchema,
    });

    const { input, warnings: inputWarnings } =
      await convertToOpenAIResponsesInput({
        prompt,
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
        tools?.find(
          tool => tool.type === 'provider-defined' && tool.id === id,
        ) != null
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
          tool.type === 'provider-defined' &&
          (tool.id === 'openai.web_search' ||
            tool.id === 'openai.web_search_preview'),
      ) as LanguageModelV3ProviderDefinedTool | undefined
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
      !modelConfig.supportsFlexProcessing
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
      !modelConfig.supportsPriorityProcessing
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
    };
  }

  async doGenerate(
    options: Parameters<LanguageModelV3['doGenerate']>[0],
  ): Promise<Awaited<ReturnType<LanguageModelV3['doGenerate']>>> {
    const {
      args: body,
      warnings,
      webSearchToolName,
    } = await this.getArgs(options);
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

        case 'image_generation_call': {
          content.push({
            type: 'tool-call',
            toolCallId: part.id,
            toolName: 'image_generation',
            input: '{}',
            providerExecuted: true,
          });

          content.push({
            type: 'tool-result',
            toolCallId: part.id,
            toolName: 'image_generation',
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
            toolName: 'local_shell',
            input: JSON.stringify({
              action: part.action,
            } satisfies InferSchema<typeof localShellInputSchema>),
            providerMetadata: {
              openai: {
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

            const annotations: Array<OpenaiResponsesOutputTextCodeInterpreterAnnotation> =
              [];

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
                  title: annotation.filename,
                  filename: annotation.filename,
                  ...(annotation.file_id
                    ? {
                        providerMetadata: {
                          openai: {
                            fileId: annotation.file_id,
                          },
                        },
                      }
                    : {}),
                });
              } else if (annotation.type === 'container_file_citation') {
                annotations.push(annotation);
              } else if (annotation.type === 'file_path') {
                annotations.push(annotation);
              }
            }

            content.push({
              type: 'text',
              text: contentPart.text,
              providerMetadata: {
                openai: {
                  itemId: part.id,
                  annotations,
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

        case 'web_search_call': {
          content.push({
            type: 'tool-call',
            toolCallId: part.id,
            toolName: webSearchToolName ?? 'web_search',
            input: JSON.stringify({}),
            providerExecuted: true,
          });

          content.push({
            type: 'tool-result',
            toolCallId: part.id,
            toolName: webSearchToolName ?? 'web_search',
            result: mapWebSearchOutput(part.action),
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
          });
          break;
        }

        case 'file_search_call': {
          content.push({
            type: 'tool-call',
            toolCallId: part.id,
            toolName: 'file_search',
            input: '{}',
            providerExecuted: true,
          });

          content.push({
            type: 'tool-result',
            toolCallId: part.id,
            toolName: 'file_search',
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
            toolName: 'code_interpreter',
            input: JSON.stringify({
              code: part.code,
              containerId: part.container_id,
            } satisfies InferSchema<typeof codeInterpreterInputSchema>),
            providerExecuted: true,
          });

          content.push({
            type: 'tool-result',
            toolCallId: part.id,
            toolName: 'code_interpreter',
            result: {
              outputs: part.outputs,
            } satisfies InferSchema<typeof codeInterpreterOutputSchema>,
          });
          break;
        }
      }
    }

    const providerMetadata: SharedV3ProviderMetadata = {
      openai: { responseId: response.id },
    };

    if (logprobs.length > 0) {
      providerMetadata.openai.logprobs = logprobs;
    }

    if (typeof response.service_tier === 'string') {
      providerMetadata.openai.serviceTier = response.service_tier;
    }

    return {
      content,
      finishReason: mapOpenAIResponseFinishReason({
        finishReason: response.incomplete_details?.reason,
        hasFunctionCall,
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
    options: Parameters<LanguageModelV3['doStream']>[0],
  ): Promise<Awaited<ReturnType<LanguageModelV3['doStream']>>> {
    const {
      args: body,
      warnings,
      webSearchToolName,
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

    const ongoingAnnotations: Array<OpenaiResponsesOutputTextCodeInterpreterAnnotation> =
      [];

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
                  toolName: webSearchToolName ?? 'web_search',
                  toolCallId: value.item.id,
                };

                controller.enqueue({
                  type: 'tool-input-start',
                  id: value.item.id,
                  toolName: webSearchToolName ?? 'web_search',
                  providerExecuted: true,
                });

                controller.enqueue({
                  type: 'tool-input-end',
                  id: value.item.id,
                });

                controller.enqueue({
                  type: 'tool-call',
                  toolCallId: value.item.id,
                  toolName: 'web_search',
                  input: JSON.stringify({}),
                  providerExecuted: true,
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
                  providerExecuted: true,
                });
              } else if (value.item.type === 'code_interpreter_call') {
                ongoingToolCalls[value.output_index] = {
                  toolName: 'code_interpreter',
                  toolCallId: value.item.id,
                  codeInterpreter: {
                    containerId: value.item.container_id,
                  },
                };

                controller.enqueue({
                  type: 'tool-input-start',
                  id: value.item.id,
                  toolName: 'code_interpreter',
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
                  toolName: 'file_search',
                  input: '{}',
                  providerExecuted: true,
                });
              } else if (value.item.type === 'image_generation_call') {
                controller.enqueue({
                  type: 'tool-call',
                  toolCallId: value.item.id,
                  toolName: 'image_generation',
                  input: '{}',
                  providerExecuted: true,
                });
              } else if (value.item.type === 'message') {
                ongoingAnnotations.splice(0, ongoingAnnotations.length);
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
            } else if (
              isResponseOutputItemDoneChunk(value) &&
              value.item.type !== 'message'
            ) {
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
                    openai: {
                      itemId: value.item.id,
                    },
                  },
                });
              } else if (value.item.type === 'web_search_call') {
                ongoingToolCalls[value.output_index] = undefined;

                controller.enqueue({
                  type: 'tool-result',
                  toolCallId: value.item.id,
                  toolName: 'web_search',
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
                });
              } else if (value.item.type === 'file_search_call') {
                ongoingToolCalls[value.output_index] = undefined;

                controller.enqueue({
                  type: 'tool-result',
                  toolCallId: value.item.id,
                  toolName: 'file_search',
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
                  toolName: 'code_interpreter',
                  result: {
                    outputs: value.item.outputs,
                  } satisfies InferSchema<typeof codeInterpreterOutputSchema>,
                });
              } else if (value.item.type === 'image_generation_call') {
                controller.enqueue({
                  type: 'tool-result',
                  toolCallId: value.item.id,
                  toolName: 'image_generation',
                  result: {
                    result: value.item.result,
                  } satisfies InferSchema<typeof imageGenerationOutputSchema>,
                });
              } else if (value.item.type === 'local_shell_call') {
                ongoingToolCalls[value.output_index] = undefined;

                controller.enqueue({
                  type: 'tool-call',
                  toolCallId: value.item.call_id,
                  toolName: 'local_shell',
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
                    openai: { itemId: value.item.id },
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
            } else if (isResponseImageGenerationCallPartialImageChunk(value)) {
              controller.enqueue({
                type: 'tool-result',
                toolCallId: value.item_id,
                toolName: 'image_generation',
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
                  toolName: 'code_interpreter',
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
                      providerMetadata: { openai: { itemId: value.item_id } },
                    });
                    activeReasoningPart.summaryParts[summaryIndex] =
                      'concluded';
                  }
                }

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
            } else if (value.type === 'response.reasoning_summary_text.delta') {
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
            } else if (value.type === 'response.reasoning_summary_part.done') {
              // when OpenAI stores the message data, we can immediately conclude the reasoning part
              // since we do not need to send the encrypted content.
              if (store) {
                controller.enqueue({
                  type: 'reasoning-end',
                  id: `${value.item_id}:${value.summary_index}`,
                  providerMetadata: {
                    openai: { itemId: value.item_id },
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
                  title: value.annotation.filename,
                  filename: value.annotation.filename,
                  ...(value.annotation.file_id
                    ? {
                        providerMetadata: {
                          openai: {
                            fileId: value.annotation.file_id,
                          },
                        },
                      }
                    : {}),
                });
              } else if (value.annotation.type === 'container_file_citation') {
                ongoingAnnotations.push(value.annotation);
              } else if (value.annotation.type === 'file_path') {
                ongoingAnnotations.push(value.annotation);
              }
            } else if (
              isResponseOutputItemDoneChunk(value) &&
              value.item.type === 'message'
            ) {
              controller.enqueue({
                type: 'text-end',
                id: value.item.id,
                providerMetadata: {
                  openai: {
                    itemId: value.item.id,
                    annotations: ongoingAnnotations,
                  },
                },
              });
            } else if (isErrorChunk(value)) {
              controller.enqueue({ type: 'error', error: value });
            }
          },

          flush(controller) {
            const providerMetadata: SharedV3ProviderMetadata = {
              openai: {
                responseId,
              },
            };

            if (logprobs.length > 0) {
              providerMetadata.openai.logprobs = logprobs;
            }

            if (serviceTier !== undefined) {
              providerMetadata.openai.serviceTier = serviceTier;
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
  const defaults = {
    systemMessageMode: 'system' as const,
    supportsFlexProcessing,
    supportsPriorityProcessing,
  };

  // gpt-5-chat models are non-reasoning
  if (modelId.startsWith('gpt-5-chat')) {
    return {
      ...defaults,
      isReasoningModel: false,
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
        ...defaults,
        isReasoningModel: true,
        systemMessageMode: 'remove',
      };
    }

    return {
      ...defaults,
      isReasoningModel: true,
      systemMessageMode: 'developer',
    };
  }

  // gpt models:
  return {
    ...defaults,
    isReasoningModel: false,
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
