import {
  InvalidResponseDataError,
  type APICallError,
  type LanguageModelV3,
  type LanguageModelV3CallOptions,
  type LanguageModelV3Content,
  type LanguageModelV3FinishReason,
  type LanguageModelV3GenerateResult,
  type LanguageModelV3StreamPart,
  type LanguageModelV3StreamResult,
  type SharedV3Warning,
} from '@ai-sdk/provider';
import {
  combineHeaders,
  createEventSourceResponseHandler,
  createJsonErrorResponseHandler,
  createJsonResponseHandler,
  generateId,
  parseProviderOptions,
  postJsonToApi,
  type FetchFunction,
  type InferSchema,
  type ParseResult,
  type ResponseHandler,
} from '@ai-sdk/provider-utils';
import { convertToDeepSeekChatMessages } from './convert-to-deepseek-chat-messages';
import { convertDeepSeekUsage } from './convert-to-deepseek-usage';
import {
  deepseekChatChunkSchema,
  deepseekChatResponseSchema,
  deepSeekErrorSchema,
  type DeepSeekChatLogprob,
  type DeepSeekChatTokenUsage,
} from './deepseek-chat-api-types';
import {
  deepseekLanguageModelOptions,
  type DeepSeekChatModelId,
} from './deepseek-chat-options';
import { prepareTools } from './deepseek-prepare-tools';
import { getResponseMetadata } from './get-response-metadata';
import { mapDeepSeekFinishReason } from './map-deepseek-finish-reason';

export type DeepSeekChatConfig = {
  provider: string;
  headers: () => Record<string, string | undefined>;
  url: (options: { modelId: string; path: string }) => string;
  fetch?: FetchFunction;
  supportsAssistantPrefixCompletion?: boolean;
  supportsPenaltySampling?: boolean;
  supportsStrictToolCalls?: boolean;
  supportsThinking?: boolean;
  supportsStructuredOutputs?: boolean;
};

function mapDeepSeekProviderReasoningEffort({
  reasoningEffort,
  warnings,
}: {
  reasoningEffort: 'low' | 'medium' | 'high' | 'xhigh' | 'max';
  warnings: SharedV3Warning[];
}): 'low' | 'high' | 'max' {
  const mapped =
    reasoningEffort === 'medium'
      ? 'high'
      : reasoningEffort === 'xhigh'
        ? 'max'
        : reasoningEffort;

  if (mapped !== reasoningEffort) {
    warnings.push({
      type: 'compatibility',
      feature: 'reasoningEffort',
      details: `reasoningEffort "${reasoningEffort}" is not a canonical DeepSeek value. mapped to "${mapped}".`,
    });
  }

  return mapped;
}

export class DeepSeekChatLanguageModel implements LanguageModelV3 {
  readonly specificationVersion = 'v3';

  readonly modelId: DeepSeekChatModelId;

  readonly supportedUrls = {
    'image/*': [/^https?:\/\/.*$/],
  };

  private readonly config: DeepSeekChatConfig;
  private readonly failedResponseHandler: ResponseHandler<APICallError>;

  constructor(modelId: DeepSeekChatModelId, config: DeepSeekChatConfig) {
    this.modelId = modelId;
    this.config = config;

    this.failedResponseHandler = createJsonErrorResponseHandler({
      errorSchema: deepSeekErrorSchema,
      errorToMessage: (error: InferSchema<typeof deepSeekErrorSchema>) =>
        error.error.message,
    });
  }

  get provider(): string {
    return this.config.provider;
  }

  private get providerOptionsName(): string {
    return this.config.provider.split('.')[0].trim();
  }

  private async getArgs({
    prompt,
    maxOutputTokens,
    temperature,
    topP,
    topK,
    frequencyPenalty,
    presencePenalty,
    providerOptions,
    stopSequences,
    responseFormat,
    seed,
    toolChoice,
    tools,
  }: LanguageModelV3CallOptions) {
    const deepseekOptions =
      (await parseProviderOptions({
        provider: this.providerOptionsName,
        providerOptions,
        schema: deepseekLanguageModelOptions,
      })) ?? {};

    const supportsStructuredOutputs =
      this.config.supportsStructuredOutputs === true;
    const supportsPenaltySampling =
      this.config.supportsPenaltySampling === true;

    const { messages, warnings } = await convertToDeepSeekChatMessages({
      prompt,
      responseFormat,
      modelId: this.modelId,
      providerOptionsName: this.providerOptionsName,
      supportsAssistantPrefixCompletion:
        this.config.supportsAssistantPrefixCompletion,
      supportsStructuredOutputs,
    });
    const allWarnings = [...warnings];

    if (topK != null) {
      allWarnings.push({ type: 'unsupported', feature: 'topK' });
    }

    if (seed != null) {
      allWarnings.push({ type: 'unsupported', feature: 'seed' });
    }

    if (!supportsPenaltySampling && frequencyPenalty != null) {
      allWarnings.push({
        type: 'other',
        message:
          'frequencyPenalty is deprecated by DeepSeek and has been omitted. Remove frequencyPenalty from the request.',
      });
    }

    if (!supportsPenaltySampling && presencePenalty != null) {
      allWarnings.push({
        type: 'other',
        message:
          'presencePenalty is deprecated by DeepSeek and has been omitted. Remove presencePenalty from the request.',
      });
    }

    const {
      tools: deepseekTools,
      toolChoice: deepseekToolChoices,
      toolWarnings,
    } = prepareTools({
      tools,
      toolChoice,
      supportsStrictToolCalls: this.config.supportsStrictToolCalls,
    });
    allWarnings.push(...toolWarnings);

    const thinkingType = deepseekOptions.thinking?.type;
    if (thinkingType === 'adaptive') {
      allWarnings.push({
        type: 'compatibility',
        feature: 'thinking.type',
        details:
          'thinking.type "adaptive" is not a canonical DeepSeek value. mapped to "enabled".',
      });
    }

    const thinking =
      this.config.supportsThinking === false
        ? undefined
        : thinkingType != null
          ? { type: thinkingType === 'adaptive' ? 'enabled' : thinkingType }
          : undefined;

    const isThinkingEnabled =
      this.config.supportsThinking !== false &&
      thinking?.type !== 'disabled' &&
      (thinking != null ||
        this.modelId === 'deepseek-reasoner' ||
        this.modelId.includes('deepseek-v4'));

    if (isThinkingEnabled && temperature != null) {
      allWarnings.push({
        type: 'unsupported',
        feature: 'temperature',
        details:
          "temperature has no effect when DeepSeek thinking is enabled. Set providerOptions.deepseek.thinking.type to 'disabled' to use temperature.",
      });
    }

    if (isThinkingEnabled && topP != null) {
      allWarnings.push({
        type: 'unsupported',
        feature: 'topP',
        details:
          "topP has no effect when DeepSeek thinking is enabled. Set providerOptions.deepseek.thinking.type to 'disabled' to use topP.",
      });
    }

    const reasoningEffort =
      deepseekOptions.reasoningEffort != null
        ? mapDeepSeekProviderReasoningEffort({
            reasoningEffort: deepseekOptions.reasoningEffort,
            warnings: allWarnings,
          })
        : undefined;

    return {
      args: {
        model: this.modelId,
        ...((deepseekOptions.logprobs === true ||
          deepseekOptions.topLogprobs != null) && { logprobs: true }),
        ...(deepseekOptions.topLogprobs != null && {
          top_logprobs: deepseekOptions.topLogprobs,
        }),
        max_tokens: maxOutputTokens,
        temperature: isThinkingEnabled ? undefined : temperature,
        top_p: isThinkingEnabled ? undefined : topP,
        frequency_penalty: supportsPenaltySampling
          ? frequencyPenalty
          : undefined,
        presence_penalty: supportsPenaltySampling ? presencePenalty : undefined,
        response_format:
          responseFormat?.type === 'json'
            ? supportsStructuredOutputs && responseFormat.schema != null
              ? {
                  type: 'json_schema',
                  json_schema: {
                    schema: responseFormat.schema,
                    strict: deepseekOptions.strictJsonSchema ?? true,
                    name: responseFormat.name ?? 'response',
                    description: responseFormat.description,
                  },
                }
              : { type: 'json_object' }
            : undefined,
        stop: stopSequences,
        messages,
        tools: deepseekTools,
        tool_choice: deepseekToolChoices,
        thinking,
        ...(deepseekOptions.userId != null && {
          user_id: deepseekOptions.userId,
        }),
        ...(thinking?.type !== 'disabled' &&
          reasoningEffort != null && {
            reasoning_effort: reasoningEffort,
          }),
      },
      warnings: allWarnings,
    };
  }

  async doGenerate(
    options: LanguageModelV3CallOptions,
  ): Promise<LanguageModelV3GenerateResult> {
    const { args, warnings } = await this.getArgs({ ...options });

    const {
      responseHeaders,
      value: responseBody,
      rawValue: rawResponse,
    } = await postJsonToApi({
      url: this.config.url({
        path: '/chat/completions',
        modelId: this.modelId,
      }),
      headers: combineHeaders(this.config.headers(), options.headers),
      body: args,
      failedResponseHandler: this.failedResponseHandler,
      successfulResponseHandler: createJsonResponseHandler(
        deepseekChatResponseSchema,
      ),
      abortSignal: options.abortSignal,
      fetch: this.config.fetch,
    });

    const choice = responseBody.choices[0];
    const content: Array<LanguageModelV3Content> = [];

    // reasoning content (before text):
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

    // text content:
    const text = choice.message.content;
    if (text != null && text.length > 0) {
      content.push({ type: 'text', text });
    }

    return {
      content,
      finishReason: {
        unified: mapDeepSeekFinishReason(choice.finish_reason),
        raw: choice.finish_reason ?? undefined,
      },
      usage: convertDeepSeekUsage(responseBody.usage),
      providerMetadata: {
        [this.providerOptionsName]: {
          promptCacheHitTokens: responseBody.usage?.prompt_cache_hit_tokens,
          promptCacheMissTokens: responseBody.usage?.prompt_cache_miss_tokens,
          ...(responseBody.object != null && {
            responseObject: responseBody.object,
          }),
          ...(choice.index != null && { choiceIndex: choice.index }),
          ...(choice.message.role != null && {
            messageRole: choice.message.role,
          }),
          ...(choice.message.tool_calls != null && {
            toolCallTypes: choice.message.tool_calls
              .map(toolCall => toolCall.type)
              .filter(type => type != null),
          }),
          ...(choice.logprobs != null && { logprobs: choice.logprobs }),
          ...(responseBody.system_fingerprint != null && {
            systemFingerprint: responseBody.system_fingerprint,
          }),
        },
      },
      request: { body: args },
      response: {
        ...getResponseMetadata(responseBody),
        headers: responseHeaders,
        body: rawResponse,
      },
      warnings,
    };
  }

  async doStream(
    options: LanguageModelV3CallOptions,
  ): Promise<LanguageModelV3StreamResult> {
    const { args, warnings } = await this.getArgs({ ...options });

    const body = {
      ...args,
      stream: true,
      stream_options: { include_usage: true },
    };

    const { responseHeaders, value: response } = await postJsonToApi({
      url: this.config.url({
        path: '/chat/completions',
        modelId: this.modelId,
      }),
      headers: combineHeaders(this.config.headers(), options.headers),
      body,
      failedResponseHandler: this.failedResponseHandler,
      successfulResponseHandler: createEventSourceResponseHandler(
        deepseekChatChunkSchema,
      ),
      abortSignal: options.abortSignal,
      fetch: this.config.fetch,
    });

    const toolCalls: Array<{
      id: string;
      type: 'function';
      function: {
        name: string;
        arguments: string;
      };
      hasFinished: boolean;
    }> = [];

    let finishReason: LanguageModelV3FinishReason = {
      unified: 'other',
      raw: undefined,
    };
    let usage: DeepSeekChatTokenUsage | undefined = undefined;
    let systemFingerprint: string | undefined = undefined;
    let isFirstChunk = true;
    const providerOptionsName = this.providerOptionsName;
    let isActiveReasoning = false;
    let isActiveText = false;
    let responseObject: 'chat.completion.chunk' | undefined;
    let choiceIndex: number | undefined;
    let messageRole: 'assistant' | undefined;
    const toolCallTypes = new Map<number, 'function'>();
    const contentLogprobs: DeepSeekChatLogprob[] = [];
    const reasoningLogprobs: DeepSeekChatLogprob[] = [];

    return {
      stream: response.pipeThrough(
        new TransformStream<
          ParseResult<InferSchema<typeof deepseekChatChunkSchema>>,
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

            // handle failed chunk parsing / validation:
            if (!chunk.success) {
              finishReason = { unified: 'error', raw: undefined };
              controller.enqueue({ type: 'error', error: chunk.error });
              return;
            }
            const value = chunk.value;

            // handle error chunks:
            if ('error' in value) {
              finishReason = { unified: 'error', raw: undefined };
              controller.enqueue({ type: 'error', error: value.error.message });
              return;
            }

            if (isFirstChunk) {
              isFirstChunk = false;

              controller.enqueue({
                type: 'response-metadata',
                ...getResponseMetadata(value),
              });
            }

            if (value.usage != null) {
              usage = value.usage;
            }

            if (value.object != null) {
              responseObject = value.object;
            }

            // The fingerprint is repeated on stream chunks; keep the latest
            // non-null value in case it changes during the response.
            if (value.system_fingerprint != null) {
              systemFingerprint = value.system_fingerprint;
            }

            const choice = value.choices[0];

            if (choice?.index != null) {
              choiceIndex = choice.index;
            }

            if (choice?.finish_reason != null) {
              finishReason = {
                unified: mapDeepSeekFinishReason(choice.finish_reason),
                raw: choice.finish_reason,
              };
            }

            if (choice?.logprobs?.content != null) {
              contentLogprobs.push(...choice.logprobs.content);
            }

            if (choice?.logprobs?.reasoning_content != null) {
              reasoningLogprobs.push(...choice.logprobs.reasoning_content);
            }

            if (choice?.delta == null) {
              return;
            }

            const delta = choice.delta;

            if (delta.role != null) {
              messageRole = delta.role;
            }

            // enqueue reasoning before text deltas:
            const reasoningContent = delta.reasoning_content;
            if (reasoningContent) {
              if (!isActiveReasoning) {
                controller.enqueue({
                  type: 'reasoning-start',
                  id: 'reasoning-0',
                });
                isActiveReasoning = true;
              }

              controller.enqueue({
                type: 'reasoning-delta',
                id: 'reasoning-0',
                delta: reasoningContent,
              });
            }

            if (delta.content) {
              if (!isActiveText) {
                controller.enqueue({ type: 'text-start', id: 'txt-0' });
                isActiveText = true;
              }

              // end reasoning when text starts:
              if (isActiveReasoning) {
                controller.enqueue({
                  type: 'reasoning-end',
                  id: 'reasoning-0',
                });
                isActiveReasoning = false;
              }

              controller.enqueue({
                type: 'text-delta',
                id: 'txt-0',
                delta: delta.content,
              });
            }

            if (delta.tool_calls != null) {
              // end reasoning when tool calls start:
              if (isActiveReasoning) {
                controller.enqueue({
                  type: 'reasoning-end',
                  id: 'reasoning-0',
                });
                isActiveReasoning = false;
              }

              for (const toolCallDelta of delta.tool_calls) {
                if (toolCallDelta.type != null) {
                  toolCallTypes.set(toolCallDelta.index, toolCallDelta.type);
                }

                const index = toolCallDelta.index;

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

                  if (
                    toolCall.function?.name != null &&
                    toolCall.function?.arguments != null
                  ) {
                    // send delta if the argument text has already started:
                    if (toolCall.function.arguments.length > 0) {
                      controller.enqueue({
                        type: 'tool-input-delta',
                        id: toolCall.id,
                        delta: toolCall.function.arguments,
                      });
                    }
                  }

                  continue;
                }

                // existing tool call, merge if not finished
                const toolCall = toolCalls[index];

                if (toolCall.hasFinished) {
                  continue;
                }

                if (toolCallDelta.function?.arguments != null) {
                  toolCall.function!.arguments +=
                    toolCallDelta.function?.arguments ?? '';
                }

                // send delta
                controller.enqueue({
                  type: 'tool-input-delta',
                  id: toolCall.id,
                  delta: toolCallDelta.function.arguments ?? '',
                });
              }
            }
          },

          flush(controller) {
            if (isActiveReasoning) {
              controller.enqueue({ type: 'reasoning-end', id: 'reasoning-0' });
            }

            if (isActiveText) {
              controller.enqueue({ type: 'text-end', id: 'txt-0' });
            }

            // go through all tool calls and send the ones that are not finished
            for (const toolCall of toolCalls.filter(
              toolCall => !toolCall.hasFinished,
            )) {
              controller.enqueue({
                type: 'tool-input-end',
                id: toolCall.id,
              });

              controller.enqueue({
                type: 'tool-call',
                toolCallId: toolCall.id ?? generateId(),
                toolName: toolCall.function.name,
                input: toolCall.function.arguments,
              });
            }

            controller.enqueue({
              type: 'finish',
              finishReason,
              usage: convertDeepSeekUsage(usage),
              providerMetadata: {
                [providerOptionsName]: {
                  promptCacheHitTokens:
                    usage?.prompt_cache_hit_tokens ?? undefined,
                  promptCacheMissTokens:
                    usage?.prompt_cache_miss_tokens ?? undefined,
                  ...(responseObject != null && { responseObject }),
                  ...(choiceIndex != null && { choiceIndex }),
                  ...(messageRole != null && { messageRole }),
                  ...(toolCallTypes.size > 0 && {
                    toolCallTypes: [...toolCallTypes.entries()]
                      .sort(([left], [right]) => left - right)
                      .map(([, type]) => type),
                  }),
                  ...((contentLogprobs.length > 0 ||
                    reasoningLogprobs.length > 0) && {
                    logprobs: {
                      ...(contentLogprobs.length > 0 && {
                        content: contentLogprobs,
                      }),
                      ...(reasoningLogprobs.length > 0 && {
                        reasoning_content: reasoningLogprobs,
                      }),
                    },
                  }),
                  ...(systemFingerprint != null && { systemFingerprint }),
                },
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
