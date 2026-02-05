import {
  InvalidResponseDataError,
  LanguageModelV3,
  LanguageModelV3CallOptions,
  LanguageModelV3Content,
  LanguageModelV3FinishReason,
  LanguageModelV3GenerateResult,
  LanguageModelV3StreamPart,
  LanguageModelV3StreamResult,
  SharedV3Warning,
} from '@ai-sdk/provider';
import {
  combineHeaders,
  createEventSourceResponseHandler,
  createJsonResponseHandler,
  FetchFunction,
  generateId,
  isParsableJson,
  parseProviderOptions,
  ParseResult,
  postJsonToApi,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';
import {
  getResponseMetadata,
  mapOpenAICompatibleFinishReason,
  prepareTools,
} from '@ai-sdk/openai-compatible/internal';
import { AlibabaConfig } from './alibaba-config';
import {
  AlibabaChatModelId,
  alibabaProviderOptions,
} from './alibaba-chat-options';
import { alibabaFailedResponseHandler } from './alibaba-provider';
import { convertToAlibabaChatMessages } from './convert-to-alibaba-chat-messages';
import { convertAlibabaUsage } from './convert-alibaba-usage';
import { CacheControlValidator } from './get-cache-control';

/**
 * Alibaba language model implementation.
 *
 * Implements LanguageModelV3 interface for Alibaba Cloud's Qwen models.
 * Supports OpenAI-compatible chat completions API with Alibaba-specific features:
 * - Reasoning/thinking mode (enable_thinking, reasoning_content)
 * - Thinking budget control (thinking_budget)
 * - Prompt caching (cached_tokens tracking)
 */
export class AlibabaLanguageModel implements LanguageModelV3 {
  readonly specificationVersion = 'v3';
  readonly modelId: AlibabaChatModelId;

  private readonly config: AlibabaConfig;

  constructor(modelId: AlibabaChatModelId, config: AlibabaConfig) {
    this.modelId = modelId;
    this.config = config;
  }

  get provider(): string {
    return this.config.provider;
  }

  readonly supportedUrls: Record<string, RegExp[]> = {
    'image/*': [/^https?:\/\/.*$/],
  };

  /**
   * Builds request arguments for Alibaba API call.
   * Converts AI SDK options to Alibaba API format.
   */
  private async getArgs({
    prompt,
    maxOutputTokens,
    temperature,
    topP,
    topK,
    frequencyPenalty,
    presencePenalty,
    stopSequences,
    responseFormat,
    seed,
    providerOptions,
    tools,
    toolChoice,
  }: LanguageModelV3CallOptions) {
    const warnings: SharedV3Warning[] = [];

    const cacheControlValidator = new CacheControlValidator();

    const alibabaOptions = await parseProviderOptions({
      provider: 'alibaba',
      providerOptions,
      schema: alibabaProviderOptions,
    });

    // Warn about unsupported features
    if (frequencyPenalty != null) {
      warnings.push({ type: 'unsupported', feature: 'frequencyPenalty' });
    }

    // Build base request arguments
    const baseArgs = {
      model: this.modelId,
      max_tokens: maxOutputTokens,
      temperature,
      top_p: topP,
      top_k: topK,
      presence_penalty: presencePenalty,
      stop: stopSequences,
      seed,
      response_format:
        responseFormat?.type === 'json'
          ? responseFormat.schema != null
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

      // Alibaba-specific options
      ...(alibabaOptions?.enableThinking != null
        ? { enable_thinking: alibabaOptions.enableThinking }
        : {}),
      ...(alibabaOptions?.thinkingBudget != null
        ? { thinking_budget: alibabaOptions.thinkingBudget }
        : {}),

      // Convert messages with cache control support
      messages: convertToAlibabaChatMessages({
        prompt,
        cacheControlValidator,
      }),
    };

    // Prepare tools
    const {
      tools: alibabaTools,
      toolChoice: alibabaToolChoice,
      toolWarnings,
    } = prepareTools({ tools, toolChoice });

    warnings.push(...cacheControlValidator.getWarnings());

    return {
      args: {
        ...baseArgs,
        tools: alibabaTools,
        tool_choice: alibabaToolChoice,
        ...(alibabaTools != null &&
        alibabaOptions?.parallelToolCalls !== undefined
          ? { parallel_tool_calls: alibabaOptions.parallelToolCalls }
          : {}),
      },
      warnings: [...warnings, ...toolWarnings],
    };
  }

  async doGenerate(
    options: LanguageModelV3CallOptions,
  ): Promise<LanguageModelV3GenerateResult> {
    const { args, warnings } = await this.getArgs(options);

    const {
      responseHeaders,
      value: response,
      rawValue: rawResponse,
    } = await postJsonToApi({
      url: `${this.config.baseURL}/chat/completions`,
      headers: combineHeaders(this.config.headers(), options.headers),
      body: args,
      failedResponseHandler: alibabaFailedResponseHandler,
      successfulResponseHandler: createJsonResponseHandler(
        alibabaChatResponseSchema,
      ),
      abortSignal: options.abortSignal,
      fetch: this.config.fetch,
    });

    const choice = response.choices[0];
    const content: Array<LanguageModelV3Content> = [];

    // text content:
    const text = choice.message.content;
    if (text != null && text.length > 0) {
      content.push({ type: 'text', text });
    }

    // reasoning content (Alibaba uses 'reasoning_content' field):
    const reasoning = choice.message.reasoning_content;
    if (reasoning != null && reasoning.length > 0) {
      content.push({
        type: 'reasoning',
        text: reasoning,
      });
    }

    // tool calls:
    if (choice.message.tool_calls != null) {
      for (const toolCall of choice.message.tool_calls) {
        content.push({
          type: 'tool-call',
          toolCallId: toolCall.id,
          toolName: toolCall.function.name,
          input: toolCall.function.arguments!,
        });
      }
    }

    return {
      content,
      finishReason: {
        unified: mapOpenAICompatibleFinishReason(choice.finish_reason),
        raw: choice.finish_reason ?? undefined,
      },
      usage: convertAlibabaUsage(response.usage),
      request: { body: JSON.stringify(args) },
      response: {
        ...getResponseMetadata(response),
        headers: responseHeaders,
        body: rawResponse,
      },
      warnings,
    };
  }

  async doStream(
    options: LanguageModelV3CallOptions,
  ): Promise<LanguageModelV3StreamResult> {
    const { args, warnings } = await this.getArgs(options);
    const body = {
      ...args,
      stream: true,
      stream_options: this.config.includeUsage
        ? { include_usage: true }
        : undefined,
    };

    const { responseHeaders, value: response } = await postJsonToApi({
      url: `${this.config.baseURL}/chat/completions`,
      headers: combineHeaders(this.config.headers(), options.headers),
      body,
      failedResponseHandler: alibabaFailedResponseHandler,
      successfulResponseHandler: createEventSourceResponseHandler(
        alibabaChatChunkSchema,
      ),
      abortSignal: options.abortSignal,
      fetch: this.config.fetch,
    });

    // Track state across chunks
    let finishReason: LanguageModelV3FinishReason = {
      unified: 'other',
      raw: undefined,
    };
    let usage: z.infer<typeof alibabaUsageSchema> | undefined = undefined;

    let isFirstChunk = true;
    let activeText = false;
    let activeReasoningId: string | null = null;

    // Track tool calls for accumulation across chunks
    const toolCalls: Array<{
      id: string;
      type: 'function';
      function: { name: string; arguments: string };
      hasFinished: boolean;
    }> = [];

    return {
      stream: response.pipeThrough(
        new TransformStream<
          ParseResult<z.infer<typeof alibabaChatChunkSchema>>,
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

            // Handle parse errors
            if (!chunk.success) {
              controller.enqueue({ type: 'error', error: chunk.error });
              return;
            }

            const value = chunk.value;

            // Emit response metadata on first chunk
            if (isFirstChunk) {
              isFirstChunk = false;
              controller.enqueue({
                type: 'response-metadata',
                ...getResponseMetadata(value),
              });
            }

            // Track usage (appears in final chunk)
            if (value.usage != null) {
              usage = value.usage;
            }

            // Skip processing if no choices (usage-only chunk)
            if (value.choices.length === 0) {
              return;
            }

            const choice = value.choices[0];
            const delta = choice.delta;

            // Handle reasoning content streaming (Alibaba thinking mode)
            if (
              delta.reasoning_content != null &&
              delta.reasoning_content.length > 0
            ) {
              if (activeReasoningId == null) {
                // End any active text before starting reasoning
                if (activeText) {
                  controller.enqueue({ type: 'text-end', id: '0' });
                  activeText = false;
                }

                activeReasoningId = generateId();
                controller.enqueue({
                  type: 'reasoning-start',
                  id: activeReasoningId,
                });
              }

              controller.enqueue({
                type: 'reasoning-delta',
                id: activeReasoningId,
                delta: delta.reasoning_content,
              });
            }

            // Handle text content streaming
            if (delta.content != null && delta.content.length > 0) {
              // End any active reasoning before starting text
              if (activeReasoningId != null) {
                controller.enqueue({
                  type: 'reasoning-end',
                  id: activeReasoningId,
                });
                activeReasoningId = null;
              }

              if (!activeText) {
                controller.enqueue({ type: 'text-start', id: '0' });
                activeText = true;
              }

              controller.enqueue({
                type: 'text-delta',
                id: '0',
                delta: delta.content,
              });
            }

            // Handle tool call streaming
            if (delta.tool_calls != null) {
              // End any active reasoning or text before tool calls
              if (activeReasoningId != null) {
                controller.enqueue({
                  type: 'reasoning-end',
                  id: activeReasoningId,
                });
                activeReasoningId = null;
              }
              if (activeText) {
                controller.enqueue({ type: 'text-end', id: '0' });
                activeText = false;
              }

              for (const toolCallDelta of delta.tool_calls) {
                const index = toolCallDelta.index ?? toolCalls.length;

                // New tool call - first chunk with id and name
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

                  // Send initial delta if arguments started
                  if (toolCall.function.arguments.length > 0) {
                    controller.enqueue({
                      type: 'tool-input-delta',
                      id: toolCall.id,
                      delta: toolCall.function.arguments,
                    });
                  }

                  // Check if already complete (some providers send full tool call at once)
                  if (isParsableJson(toolCall.function.arguments)) {
                    controller.enqueue({
                      type: 'tool-input-end',
                      id: toolCall.id,
                    });

                    controller.enqueue({
                      type: 'tool-call',
                      toolCallId: toolCall.id,
                      toolName: toolCall.function.name,
                      input: toolCall.function.arguments,
                    });

                    toolCall.hasFinished = true;
                  }

                  continue;
                }

                // Existing tool call - accumulate arguments
                const toolCall = toolCalls[index];

                if (toolCall.hasFinished) {
                  continue;
                }

                // Append arguments if not null (skip arguments: null chunks)
                if (toolCallDelta.function?.arguments != null) {
                  toolCall.function.arguments +=
                    toolCallDelta.function.arguments;

                  controller.enqueue({
                    type: 'tool-input-delta',
                    id: toolCall.id,
                    delta: toolCallDelta.function.arguments,
                  });
                }

                // Check if tool call is now complete
                if (isParsableJson(toolCall.function.arguments)) {
                  controller.enqueue({
                    type: 'tool-input-end',
                    id: toolCall.id,
                  });

                  controller.enqueue({
                    type: 'tool-call',
                    toolCallId: toolCall.id,
                    toolName: toolCall.function.name,
                    input: toolCall.function.arguments,
                  });

                  toolCall.hasFinished = true;
                }
              }
            }

            // Track finish reason
            if (choice.finish_reason != null) {
              finishReason = {
                unified: mapOpenAICompatibleFinishReason(choice.finish_reason),
                raw: choice.finish_reason,
              };
            }
          },

          flush(controller) {
            if (activeReasoningId != null) {
              controller.enqueue({
                type: 'reasoning-end',
                id: activeReasoningId,
              });
            }

            if (activeText) {
              controller.enqueue({ type: 'text-end', id: '0' });
            }

            controller.enqueue({
              type: 'finish',
              finishReason,
              usage: convertAlibabaUsage(usage),
            });
          },
        }),
      ),
      request: { body: JSON.stringify(body) },
      response: { headers: responseHeaders },
    };
  }
}

/**
 * Reference for schemas below:
 * https://www.alibabacloud.com/help/en/model-studio/qwen-api-via-openai-chat-completions
 */
const alibabaUsageSchema = z.object({
  prompt_tokens: z.number(),
  completion_tokens: z.number(),
  total_tokens: z.number(),
  prompt_tokens_details: z
    .object({
      cached_tokens: z.number().nullish(),
      cache_creation_input_tokens: z.number().nullish(),
    })
    .nullish(),
  completion_tokens_details: z
    .object({
      reasoning_tokens: z.number().nullish(),
    })
    .nullish(),
});

const alibabaChatResponseSchema = z.object({
  id: z.string().nullish(),
  created: z.number().nullish(),
  model: z.string().nullish(),
  choices: z.array(
    z.object({
      message: z.object({
        role: z.literal('assistant').nullish(),
        content: z.string().nullish(),
        reasoning_content: z.string().nullish(), // Alibaba thinking mode
        tool_calls: z
          .array(
            z.object({
              id: z.string(),
              type: z.literal('function'),
              function: z.object({
                name: z.string(),
                arguments: z.string(),
              }),
            }),
          )
          .nullish(),
      }),
      finish_reason: z.string().nullish(),
      index: z.number(),
    }),
  ),
  usage: alibabaUsageSchema.nullish(),
});

const alibabaChatChunkSchema = z.object({
  id: z.string().nullish(),
  created: z.number().nullish(),
  model: z.string().nullish(),
  choices: z.array(
    z.object({
      delta: z.object({
        role: z.enum(['assistant']).nullish(),
        content: z.string().nullish(),
        reasoning_content: z.string().nullish(), // Alibaba thinking mode delta
        tool_calls: z
          .array(
            z.object({
              index: z.number().nullish(), // Index for accumulating tool calls
              id: z.string().nullish(),
              type: z.literal('function').nullish(),
              function: z
                .object({
                  name: z.string().nullish(),
                  arguments: z.string().nullish(),
                })
                .nullish(),
            }),
          )
          .nullish(),
      }),
      finish_reason: z.string().nullish(),
      index: z.number(),
    }),
  ),
  usage: alibabaUsageSchema.nullish(), // Usage only appears in final chunk
});
