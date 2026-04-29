import {
  getResponseMetadata,
  mapOpenAICompatibleFinishReason,
  prepareTools,
} from '@ai-sdk/openai-compatible/internal';
import {
  type LanguageModelV4,
  type LanguageModelV4CallOptions,
  type LanguageModelV4Content,
  type LanguageModelV4FinishReason,
  type LanguageModelV4GenerateResult,
  type LanguageModelV4StreamPart,
  type LanguageModelV4StreamResult,
  type SharedV4Warning,
} from '@ai-sdk/provider';
import {
  combineHeaders,
  createEventSourceResponseHandler,
  createJsonResponseHandler,
  generateId,
  type InferSchema,
  isCustomReasoning,
  mapReasoningToProviderBudget,
  parseProviderOptions,
  postJsonToApi,
  type ParseResult,
  safeParseJSON,
  serializeModelOptions,
  StreamingToolCallTracker,
  WORKFLOW_SERIALIZE,
  WORKFLOW_DESERIALIZE,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';
import {
  alibabaLanguageModelOptions,
  type AlibabaChatModelId,
} from './alibaba-chat-options';
import type { AlibabaConfig } from './alibaba-config';
import { alibabaFailedResponseHandler } from './alibaba-provider';
import { convertAlibabaUsage } from './convert-alibaba-usage';
import { convertToAlibabaChatMessages } from './convert-to-alibaba-chat-messages';
import { CacheControlValidator } from './get-cache-control';

/**
 * Alibaba language model implementation.
 *
 * Implements LanguageModelV4 interface for Alibaba Cloud's Qwen models.
 * Supports OpenAI-compatible chat completions API with Alibaba-specific features:
 * - Reasoning/thinking mode (enable_thinking, reasoning_content)
 * - Thinking budget control (thinking_budget)
 * - Prompt caching (cached_tokens tracking)
 */
export class AlibabaLanguageModel implements LanguageModelV4 {
  readonly specificationVersion = 'v4';
  readonly modelId: AlibabaChatModelId;

  private readonly config: AlibabaConfig;

  static [WORKFLOW_SERIALIZE](model: AlibabaLanguageModel) {
    return serializeModelOptions({
      modelId: model.modelId,
      config: model.config,
    });
  }

  static [WORKFLOW_DESERIALIZE](options: {
    modelId: AlibabaChatModelId;
    config: AlibabaConfig;
  }) {
    return new AlibabaLanguageModel(options.modelId, options.config);
  }

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
    reasoning,
    providerOptions,
    tools,
    toolChoice,
  }: LanguageModelV4CallOptions) {
    const warnings: SharedV4Warning[] = [];

    const cacheControlValidator = new CacheControlValidator();

    const alibabaOptions = await parseProviderOptions({
      provider: 'alibaba',
      providerOptions,
      schema: alibabaLanguageModelOptions,
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

      ...resolveAlibabaThinking({
        reasoning,
        alibabaOptions,
        warnings,
      }),

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
    options: LanguageModelV4CallOptions,
  ): Promise<LanguageModelV4GenerateResult> {
    const { args, warnings } = await this.getArgs(options);

    const {
      responseHeaders,
      value: response,
      rawValue: rawResponse,
    } = await postJsonToApi({
      url: `${this.config.baseURL}/chat/completions`,
      headers: combineHeaders(this.config.headers?.(), options.headers),
      body: args,
      failedResponseHandler: alibabaFailedResponseHandler,
      successfulResponseHandler: createJsonResponseHandler(
        alibabaChatResponseSchema,
      ),
      abortSignal: options.abortSignal,
      fetch: this.config.fetch,
    });

    const choice = response.choices[0];
    const content: Array<LanguageModelV4Content> = [];

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
          toolCallId: toolCall.id ?? generateId(),
          toolName: toolCall.function.name,
          input: toolCall.function.arguments!,
        });
      }
    }

    /**
     * Some Qwen variants occasionally emit tool calls inside reasoning text.
     *
     * @link https://github.com/QwenLM/Qwen3.6/issues/125
     */
    const recoveredToolCalls =
      choice.message.tool_calls == null && reasoning != null
        ? await extractToolCallsFromReasoning(reasoning)
        : [];

    if (recoveredToolCalls.length > 0) {
      for (const toolCall of recoveredToolCalls) {
        content.push({
          type: 'tool-call',
          toolCallId: toolCall.id ?? generateId(),
          toolName: toolCall.name,
          input: toolCall.arguments,
        });
      }
    }

    const unifiedFinishReason = mapOpenAICompatibleFinishReason(
      choice.finish_reason,
    );
    const finishReason =
      recoveredToolCalls.length > 0 && unifiedFinishReason !== 'tool-calls'
        ? {
            unified: 'tool-calls' as const,
            raw: choice.finish_reason ?? 'stop',
          }
        : {
            unified: unifiedFinishReason,
            raw: choice.finish_reason ?? undefined,
          };

    return {
      content,
      finishReason,
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
    options: LanguageModelV4CallOptions,
  ): Promise<LanguageModelV4StreamResult> {
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
      headers: combineHeaders(this.config.headers?.(), options.headers),
      body,
      failedResponseHandler: alibabaFailedResponseHandler,
      successfulResponseHandler: createEventSourceResponseHandler(
        alibabaChatChunkSchema,
      ),
      abortSignal: options.abortSignal,
      fetch: this.config.fetch,
    });

    // Track state across chunks
    let finishReason: LanguageModelV4FinishReason = {
      unified: 'other',
      raw: undefined,
    };
    let usage: z.infer<typeof alibabaUsageSchema> | undefined = undefined;

    let isFirstChunk = true;
    let activeText = false;
    let activeReasoningId: string | null = null;
    let reasoningBuffer = '';
    let sawNativeToolCalls = false;

    let toolCallTracker: StreamingToolCallTracker;

    return {
      stream: response.pipeThrough(
        new TransformStream<
          ParseResult<z.infer<typeof alibabaChatChunkSchema>>,
          LanguageModelV4StreamPart
        >({
          start(controller) {
            toolCallTracker = new StreamingToolCallTracker(controller, {
              generateId,
            });
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
              reasoningBuffer += delta.reasoning_content;

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
              sawNativeToolCalls = true;

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
                toolCallTracker.processDelta(toolCallDelta);
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

          async flush(controller) {
            if (activeReasoningId != null) {
              controller.enqueue({
                type: 'reasoning-end',
                id: activeReasoningId,
              });
            }

            if (activeText) {
              controller.enqueue({ type: 'text-end', id: '0' });
            }

            toolCallTracker.flush();

            if (!sawNativeToolCalls) {
              const recoveredToolCalls =
                await extractToolCallsFromReasoning(reasoningBuffer);

              if (recoveredToolCalls.length > 0) {
                for (const toolCall of recoveredToolCalls) {
                  const toolCallId = toolCall.id ?? generateId();

                  controller.enqueue({
                    type: 'tool-input-start',
                    id: toolCallId,
                    toolName: toolCall.name,
                  });
                  controller.enqueue({
                    type: 'tool-input-delta',
                    id: toolCallId,
                    delta: toolCall.arguments,
                  });
                  controller.enqueue({
                    type: 'tool-input-end',
                    id: toolCallId,
                  });
                  controller.enqueue({
                    type: 'tool-call',
                    toolCallId,
                    toolName: toolCall.name,
                    input: toolCall.arguments,
                  });
                }

                if (finishReason.unified !== 'tool-calls') {
                  finishReason = {
                    unified: 'tool-calls',
                    raw: finishReason.raw ?? 'stop',
                  };
                }
              }
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

function resolveAlibabaThinking({
  reasoning,
  alibabaOptions,
  warnings,
}: {
  reasoning: LanguageModelV4CallOptions['reasoning'];
  alibabaOptions: InferSchema<typeof alibabaLanguageModelOptions> | undefined;
  warnings: SharedV4Warning[];
}): { enable_thinking?: boolean; thinking_budget?: number } {
  if (
    alibabaOptions?.enableThinking != null ||
    alibabaOptions?.thinkingBudget != null
  ) {
    return {
      ...(alibabaOptions.enableThinking != null
        ? { enable_thinking: alibabaOptions.enableThinking }
        : {}),
      ...(alibabaOptions.thinkingBudget != null
        ? { thinking_budget: alibabaOptions.thinkingBudget }
        : {}),
    };
  }

  if (!isCustomReasoning(reasoning)) {
    return {};
  }

  if (reasoning === 'none') {
    return { enable_thinking: false };
  }

  const thinkingBudget = mapReasoningToProviderBudget({
    reasoning,
    maxOutputTokens: 16384,
    maxReasoningBudget: 16384,
    warnings,
  });

  return {
    enable_thinking: true,
    ...(thinkingBudget != null ? { thinking_budget: thinkingBudget } : {}),
  };
}

type RecoveredToolCall = {
  id?: string;
  name: string;
  arguments: string;
};

async function extractToolCallsFromReasoning(
  reasoning: string,
): Promise<RecoveredToolCall[]> {
  const recovered: RecoveredToolCall[] = [];
  const seen: Record<string, boolean> = {};

  const xmlToolCalls = extractQwenXmlToolCalls(reasoning);
  for (const toolCall of xmlToolCalls) {
    const dedupeKey = `${toolCall.name}\u0000${toolCall.arguments}`;
    if (seen[dedupeKey]) {
      continue;
    }
    seen[dedupeKey] = true;
    recovered.push(toolCall);
  }

  const candidates = getReasoningJsonCandidates(reasoning);
  for (const candidate of candidates) {
    const parseResult = await safeParseJSON({ text: candidate });
    if (!parseResult.success) {
      continue;
    }

    for (const toolCall of normalizeToolCallPayload(parseResult.value)) {
      const dedupeKey = `${toolCall.name}\u0000${toolCall.arguments}`;
      if (seen[dedupeKey]) {
        continue;
      }
      seen[dedupeKey] = true;
      recovered.push(toolCall);
    }
  }

  return recovered;
}

function extractQwenXmlToolCalls(reasoning: string): RecoveredToolCall[] {
  const recovered: RecoveredToolCall[] = [];
  const toolCallRegex = /<tool_call>([\s\S]*?)<\/tool_call>/g;
  let match = toolCallRegex.exec(reasoning);

  while (match != null) {
    const toolCallContent = match[1]?.trim();
    if (toolCallContent != null && toolCallContent.length > 0) {
      const functionMatch =
        /^<function=([A-Za-z0-9_.:-]+)>([\s\S]*?)<\/function>$/.exec(
          toolCallContent,
        );

      if (functionMatch != null) {
        const toolName = functionMatch[1]?.trim();
        const rawArguments = functionMatch[2]?.trim() ?? '';
        if (toolName != null && toolName.length > 0) {
          recovered.push({
            name: toolName,
            arguments: rawArguments.length > 0 ? rawArguments : '{}',
          });
        }
      }
    }

    match = toolCallRegex.exec(reasoning);
  }

  return recovered;
}

function getReasoningJsonCandidates(reasoning: string): string[] {
  const candidates: string[] = [];
  const pushCandidate = (candidate: string) => {
    if (!candidates.includes(candidate)) {
      candidates.push(candidate);
    }
  };
  const trimmed = reasoning.trim();

  if (trimmed.includes('tool') && trimmed.length > 0) {
    pushCandidate(trimmed);
  }

  const codeBlockRegex = /```(?:json)?\s*([\s\S]*?)```/g;
  let match = codeBlockRegex.exec(reasoning);
  while (match != null) {
    const candidate = match[1]?.trim();
    if (candidate != null && candidate.includes('tool')) {
      pushCandidate(candidate);
    }
    match = codeBlockRegex.exec(reasoning);
  }

  const toolCallTagRegex = /<tool_calls?>\s*([\s\S]*?)\s*<\/tool_calls?>/g;
  match = toolCallTagRegex.exec(reasoning);
  while (match != null) {
    const candidate = match[1]?.trim();
    if (candidate != null && candidate.length > 0) {
      pushCandidate(candidate);
    }
    match = toolCallTagRegex.exec(reasoning);
  }

  return candidates;
}

function normalizeToolCallPayload(payload: unknown): RecoveredToolCall[] {
  const parseSingle = (value: unknown): RecoveredToolCall | undefined => {
    if (value == null || typeof value !== 'object') {
      return undefined;
    }

    const maybeToolCall = value as {
      id?: unknown;
      name?: unknown;
      arguments?: unknown;
      function?: {
        name?: unknown;
        arguments?: unknown;
      };
    };

    const name =
      typeof maybeToolCall.function?.name === 'string'
        ? maybeToolCall.function.name
        : typeof maybeToolCall.name === 'string'
          ? maybeToolCall.name
          : undefined;

    if (name == null || name.length === 0) {
      return undefined;
    }

    const rawArguments =
      maybeToolCall.function?.arguments ?? maybeToolCall.arguments ?? {};
    const argumentsText =
      typeof rawArguments === 'string'
        ? rawArguments
        : JSON.stringify(rawArguments);

    if (argumentsText == null) {
      return undefined;
    }

    return {
      id: typeof maybeToolCall.id === 'string' ? maybeToolCall.id : undefined,
      name,
      arguments: argumentsText,
    };
  };

  if (Array.isArray(payload)) {
    return payload
      .map(parseSingle)
      .filter((toolCall): toolCall is RecoveredToolCall => toolCall != null);
  }

  if (payload == null || typeof payload !== 'object') {
    return [];
  }

  const record = payload as {
    tool_calls?: unknown;
    tool_call?: unknown;
  };

  if (Array.isArray(record.tool_calls)) {
    return record.tool_calls
      .map(parseSingle)
      .filter((toolCall): toolCall is RecoveredToolCall => toolCall != null);
  }

  if (record.tool_call != null) {
    const toolCall = parseSingle(record.tool_call);
    return toolCall != null ? [toolCall] : [];
  }

  const directToolCall = parseSingle(payload);
  return directToolCall != null ? [directToolCall] : [];
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
