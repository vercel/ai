import {
  InvalidResponseDataError,
  LanguageModelV2,
  LanguageModelV2CallOptions,
  LanguageModelV2CallWarning,
  LanguageModelV2FinishReason,
  LanguageModelV2LogProbs,
  LanguageModelV2ProviderMetadata,
  LanguageModelV2StreamPart,
  LanguageModelV2Usage,
} from '@ai-sdk/provider';
import {
  FetchFunction,
  ParseResult,
  combineHeaders,
  createEventSourceResponseHandler,
  createJsonResponseHandler,
  generateId,
  isParsableJson,
  postJsonToApi,
} from '@ai-sdk/provider-utils';
import { z } from 'zod';
import { convertToOpenAIChatMessages } from './convert-to-openai-chat-messages';
import { mapOpenAIChatLogProbsOutput } from './map-openai-chat-logprobs';
import { mapOpenAIFinishReason } from './map-openai-finish-reason';
import { OpenAIChatModelId, OpenAIChatSettings } from './openai-chat-settings';
import {
  openaiErrorDataSchema,
  openaiFailedResponseHandler,
} from './openai-error';
import { getResponseMetadata } from './get-response-metadata';
import { prepareTools } from './openai-prepare-tools';

type OpenAIChatConfig = {
  provider: string;
  compatibility: 'strict' | 'compatible';
  headers: () => Record<string, string | undefined>;
  url: (options: { modelId: string; path: string }) => string;
  fetch?: FetchFunction;
};

export class OpenAIChatLanguageModel implements LanguageModelV2 {
  readonly specificationVersion = 'v2';

  readonly modelId: OpenAIChatModelId;
  readonly settings: OpenAIChatSettings;

  private readonly config: OpenAIChatConfig;

  constructor(
    modelId: OpenAIChatModelId,
    settings: OpenAIChatSettings,
    config: OpenAIChatConfig,
  ) {
    this.modelId = modelId;
    this.settings = settings;
    this.config = config;
  }

  get supportsStructuredOutputs(): boolean {
    // enable structured outputs for reasoning models by default:
    // TODO in the next major version, remove this and always use json mode for models
    // that support structured outputs (blacklist other models)
    return this.settings.structuredOutputs ?? isReasoningModel(this.modelId);
  }

  get defaultObjectGenerationMode() {
    // audio models don't support structured outputs:
    if (isAudioModel(this.modelId)) {
      return 'tool';
    }

    return this.supportsStructuredOutputs ? 'json' : 'tool';
  }

  get provider(): string {
    return this.config.provider;
  }

  get supportsImageUrls(): boolean {
    // image urls can be sent if downloadImages is disabled (default):
    return !this.settings.downloadImages;
  }

  private getArgs({
    prompt,
    maxTokens,
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
  }: LanguageModelV2CallOptions) {
    const warnings: LanguageModelV2CallWarning[] = [];

    if (topK != null) {
      warnings.push({
        type: 'unsupported-setting',
        setting: 'topK',
      });
    }

    if (
      responseFormat?.type === 'json' &&
      responseFormat.schema != null &&
      !this.supportsStructuredOutputs
    ) {
      warnings.push({
        type: 'unsupported-setting',
        setting: 'responseFormat',
        details:
          'JSON response format schema is only supported with structuredOutputs',
      });
    }

    const { messages, warnings: messageWarnings } = convertToOpenAIChatMessages(
      {
        prompt,
        systemMessageMode: getSystemMessageMode(this.modelId),
      },
    );

    warnings.push(...messageWarnings);

    const baseArgs = {
      // model id:
      model: this.modelId,

      // model specific settings:
      logit_bias: this.settings.logitBias,
      logprobs:
        this.settings.logprobs === true ||
        typeof this.settings.logprobs === 'number'
          ? true
          : undefined,
      top_logprobs:
        typeof this.settings.logprobs === 'number'
          ? this.settings.logprobs
          : typeof this.settings.logprobs === 'boolean'
            ? this.settings.logprobs
              ? 0
              : undefined
            : undefined,
      user: this.settings.user,
      parallel_tool_calls: this.settings.parallelToolCalls,

      // standardized settings:
      max_tokens: maxTokens,
      temperature,
      top_p: topP,
      frequency_penalty: frequencyPenalty,
      presence_penalty: presencePenalty,
      // TODO improve below:
      response_format:
        responseFormat?.type === 'json'
          ? this.supportsStructuredOutputs && responseFormat.schema != null
            ? {
                type: 'json_schema',
                json_schema: {
                  schema: responseFormat.schema,
                  strict: true,
                  name: responseFormat.name ?? 'response',
                  description: responseFormat.description,
                },
              }
            : { type: 'json_object' }
          : undefined,
      stop: stopSequences,
      seed,

      // openai specific settings:
      // TODO remove in next major version; we auto-map maxTokens now
      max_completion_tokens: providerOptions?.openai?.maxCompletionTokens,
      store: providerOptions?.openai?.store,
      metadata: providerOptions?.openai?.metadata,
      prediction: providerOptions?.openai?.prediction,
      reasoning_effort:
        providerOptions?.openai?.reasoningEffort ??
        this.settings.reasoningEffort,

      // messages:
      messages,
    };

    if (isReasoningModel(this.modelId)) {
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
      if (baseArgs.frequency_penalty != null) {
        baseArgs.frequency_penalty = undefined;
        warnings.push({
          type: 'unsupported-setting',
          setting: 'frequencyPenalty',
          details: 'frequencyPenalty is not supported for reasoning models',
        });
      }
      if (baseArgs.presence_penalty != null) {
        baseArgs.presence_penalty = undefined;
        warnings.push({
          type: 'unsupported-setting',
          setting: 'presencePenalty',
          details: 'presencePenalty is not supported for reasoning models',
        });
      }
      if (baseArgs.logit_bias != null) {
        baseArgs.logit_bias = undefined;
        warnings.push({
          type: 'other',
          message: 'logitBias is not supported for reasoning models',
        });
      }
      if (baseArgs.logprobs != null) {
        baseArgs.logprobs = undefined;
        warnings.push({
          type: 'other',
          message: 'logprobs is not supported for reasoning models',
        });
      }
      if (baseArgs.top_logprobs != null) {
        baseArgs.top_logprobs = undefined;
        warnings.push({
          type: 'other',
          message: 'topLogprobs is not supported for reasoning models',
        });
      }

      // reasoning models use max_completion_tokens instead of max_tokens:
      if (baseArgs.max_tokens != null) {
        if (baseArgs.max_completion_tokens == null) {
          baseArgs.max_completion_tokens = baseArgs.max_tokens;
        }
        baseArgs.max_tokens = undefined;
      }
    } else if (this.modelId.startsWith('gpt-4o-search-preview')) {
      if (baseArgs.temperature != null) {
        baseArgs.temperature = undefined;
        warnings.push({
          type: 'unsupported-setting',
          setting: 'temperature',
          details:
            'temperature is not supported for the gpt-4o-search-preview model and has been removed.',
        });
      }
    }
    const {
      tools: openaiTools,
      toolChoice: openaiToolChoice,
      toolWarnings,
    } = prepareTools({
      tools,
      toolChoice,
      structuredOutputs: this.supportsStructuredOutputs,
    });

    return {
      args: {
        ...baseArgs,
        tools: openaiTools,
        tool_choice: openaiToolChoice,
      },
      warnings: [...warnings, ...toolWarnings],
    };
  }

  async doGenerate(
    options: Parameters<LanguageModelV2['doGenerate']>[0],
  ): Promise<Awaited<ReturnType<LanguageModelV2['doGenerate']>>> {
    const { args: body, warnings } = this.getArgs(options);

    const {
      responseHeaders,
      value: response,
      rawValue: rawResponse,
    } = await postJsonToApi({
      url: this.config.url({
        path: '/chat/completions',
        modelId: this.modelId,
      }),
      headers: combineHeaders(this.config.headers(), options.headers),
      body,
      failedResponseHandler: openaiFailedResponseHandler,
      successfulResponseHandler: createJsonResponseHandler(
        openaiChatResponseSchema,
      ),
      abortSignal: options.abortSignal,
      fetch: this.config.fetch,
    });

    const { messages: rawPrompt, ...rawSettings } = body;
    const choice = response.choices[0];

    // provider metadata:
    const completionTokenDetails = response.usage?.completion_tokens_details;
    const promptTokenDetails = response.usage?.prompt_tokens_details;
    const providerMetadata: LanguageModelV2ProviderMetadata = { openai: {} };
    if (completionTokenDetails?.reasoning_tokens != null) {
      providerMetadata.openai.reasoningTokens =
        completionTokenDetails?.reasoning_tokens;
    }
    if (completionTokenDetails?.accepted_prediction_tokens != null) {
      providerMetadata.openai.acceptedPredictionTokens =
        completionTokenDetails?.accepted_prediction_tokens;
    }
    if (completionTokenDetails?.rejected_prediction_tokens != null) {
      providerMetadata.openai.rejectedPredictionTokens =
        completionTokenDetails?.rejected_prediction_tokens;
    }
    if (promptTokenDetails?.cached_tokens != null) {
      providerMetadata.openai.cachedPromptTokens =
        promptTokenDetails?.cached_tokens;
    }

    return {
      text: choice.message.content ?? undefined,
      toolCalls: choice.message.tool_calls?.map(toolCall => ({
        toolCallType: 'function',
        toolCallId: toolCall.id ?? generateId(),
        toolName: toolCall.function.name,
        args: toolCall.function.arguments!,
      })),
      finishReason: mapOpenAIFinishReason(choice.finish_reason),
      usage: {
        inputTokens: response.usage?.prompt_tokens ?? undefined,
        outputTokens: response.usage?.completion_tokens ?? undefined,
      },
      request: { body },
      response: {
        ...getResponseMetadata(response),
        headers: responseHeaders,
        body: rawResponse,
      },
      warnings,
      logprobs: mapOpenAIChatLogProbsOutput(choice.logprobs),
      providerMetadata,
    };
  }

  async doStream(
    options: Parameters<LanguageModelV2['doStream']>[0],
  ): Promise<Awaited<ReturnType<LanguageModelV2['doStream']>>> {
    const { args, warnings } = this.getArgs(options);

    const body = {
      ...args,
      stream: true,

      // only include stream_options when in strict compatibility mode:
      stream_options:
        this.config.compatibility === 'strict'
          ? { include_usage: true }
          : undefined,
    };

    const { responseHeaders, value: response } = await postJsonToApi({
      url: this.config.url({
        path: '/chat/completions',
        modelId: this.modelId,
      }),
      headers: combineHeaders(this.config.headers(), options.headers),
      body,
      failedResponseHandler: openaiFailedResponseHandler,
      successfulResponseHandler: createEventSourceResponseHandler(
        openaiChatChunkSchema,
      ),
      abortSignal: options.abortSignal,
      fetch: this.config.fetch,
    });

    const { messages: rawPrompt, ...rawSettings } = args;

    const toolCalls: Array<{
      id: string;
      type: 'function';
      function: {
        name: string;
        arguments: string;
      };
      hasFinished: boolean;
    }> = [];

    let finishReason: LanguageModelV2FinishReason = 'unknown';
    const usage: LanguageModelV2Usage = {
      inputTokens: undefined,
      outputTokens: undefined,
    };
    let logprobs: LanguageModelV2LogProbs;
    let isFirstChunk = true;

    const providerMetadata: LanguageModelV2ProviderMetadata = { openai: {} };

    return {
      stream: response.pipeThrough(
        new TransformStream<
          ParseResult<z.infer<typeof openaiChatChunkSchema>>,
          LanguageModelV2StreamPart
        >({
          transform(chunk, controller) {
            // handle failed chunk parsing / validation:
            if (!chunk.success) {
              finishReason = 'error';
              controller.enqueue({ type: 'error', error: chunk.error });
              return;
            }

            const value = chunk.value;

            // handle error chunks:
            if ('error' in value) {
              finishReason = 'error';
              controller.enqueue({ type: 'error', error: value.error });
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
              const {
                prompt_tokens,
                completion_tokens,
                prompt_tokens_details,
                completion_tokens_details,
              } = value.usage;

              usage.inputTokens = prompt_tokens ?? undefined;
              usage.outputTokens = completion_tokens ?? undefined;

              if (completion_tokens_details?.reasoning_tokens != null) {
                providerMetadata.openai.reasoningTokens =
                  completion_tokens_details?.reasoning_tokens;
              }
              if (
                completion_tokens_details?.accepted_prediction_tokens != null
              ) {
                providerMetadata.openai.acceptedPredictionTokens =
                  completion_tokens_details?.accepted_prediction_tokens;
              }
              if (
                completion_tokens_details?.rejected_prediction_tokens != null
              ) {
                providerMetadata.openai.rejectedPredictionTokens =
                  completion_tokens_details?.rejected_prediction_tokens;
              }
              if (prompt_tokens_details?.cached_tokens != null) {
                providerMetadata.openai.cachedPromptTokens =
                  prompt_tokens_details?.cached_tokens;
              }
            }

            const choice = value.choices[0];

            if (choice?.finish_reason != null) {
              finishReason = mapOpenAIFinishReason(choice.finish_reason);
            }

            if (choice?.delta == null) {
              return;
            }

            const delta = choice.delta;

            if (delta.content != null) {
              controller.enqueue({
                type: 'text-delta',
                textDelta: delta.content,
              });
            }

            const mappedLogprobs = mapOpenAIChatLogProbsOutput(
              choice?.logprobs,
            );
            if (mappedLogprobs?.length) {
              if (logprobs === undefined) logprobs = [];
              logprobs.push(...mappedLogprobs);
            }

            if (delta.tool_calls != null) {
              for (const toolCallDelta of delta.tool_calls) {
                const index = toolCallDelta.index;

                // Tool call start. OpenAI returns all information except the arguments in the first chunk.
                if (toolCalls[index] == null) {
                  if (toolCallDelta.type !== 'function') {
                    throw new InvalidResponseDataError({
                      data: toolCallDelta,
                      message: `Expected 'function' type.`,
                    });
                  }

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
                        type: 'tool-call-delta',
                        toolCallType: 'function',
                        toolCallId: toolCall.id,
                        toolName: toolCall.function.name,
                        argsTextDelta: toolCall.function.arguments,
                      });
                    }

                    // check if tool call is complete
                    // (some providers send the full tool call in one chunk):
                    if (isParsableJson(toolCall.function.arguments)) {
                      controller.enqueue({
                        type: 'tool-call',
                        toolCallType: 'function',
                        toolCallId: toolCall.id ?? generateId(),
                        toolName: toolCall.function.name,
                        args: toolCall.function.arguments,
                      });
                      toolCall.hasFinished = true;
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
                  type: 'tool-call-delta',
                  toolCallType: 'function',
                  toolCallId: toolCall.id,
                  toolName: toolCall.function.name,
                  argsTextDelta: toolCallDelta.function.arguments ?? '',
                });

                // check if tool call is complete
                if (
                  toolCall.function?.name != null &&
                  toolCall.function?.arguments != null &&
                  isParsableJson(toolCall.function.arguments)
                ) {
                  controller.enqueue({
                    type: 'tool-call',
                    toolCallType: 'function',
                    toolCallId: toolCall.id ?? generateId(),
                    toolName: toolCall.function.name,
                    args: toolCall.function.arguments,
                  });
                  toolCall.hasFinished = true;
                }
              }
            }
          },

          flush(controller) {
            controller.enqueue({
              type: 'finish',
              finishReason,
              logprobs,
              usage,
              ...(providerMetadata != null ? { providerMetadata } : {}),
            });
          },
        }),
      ),
      request: { body },
      response: { headers: responseHeaders },
      warnings,
    };
  }
}

const openaiTokenUsageSchema = z
  .object({
    prompt_tokens: z.number().nullish(),
    completion_tokens: z.number().nullish(),
    prompt_tokens_details: z
      .object({
        cached_tokens: z.number().nullish(),
      })
      .nullish(),
    completion_tokens_details: z
      .object({
        reasoning_tokens: z.number().nullish(),
        accepted_prediction_tokens: z.number().nullish(),
        rejected_prediction_tokens: z.number().nullish(),
      })
      .nullish(),
  })
  .nullish();

// limited version of the schema, focussed on what is needed for the implementation
// this approach limits breakages when the API changes and increases efficiency
const openaiChatResponseSchema = z.object({
  id: z.string().nullish(),
  created: z.number().nullish(),
  model: z.string().nullish(),
  choices: z.array(
    z.object({
      message: z.object({
        role: z.literal('assistant').nullish(),
        content: z.string().nullish(),
        tool_calls: z
          .array(
            z.object({
              id: z.string().nullish(),
              type: z.literal('function'),
              function: z.object({
                name: z.string(),
                arguments: z.string(),
              }),
            }),
          )
          .nullish(),
      }),
      index: z.number(),
      logprobs: z
        .object({
          content: z
            .array(
              z.object({
                token: z.string(),
                logprob: z.number(),
                top_logprobs: z.array(
                  z.object({
                    token: z.string(),
                    logprob: z.number(),
                  }),
                ),
              }),
            )
            .nullable(),
        })
        .nullish(),
      finish_reason: z.string().nullish(),
    }),
  ),
  usage: openaiTokenUsageSchema,
});

// limited version of the schema, focussed on what is needed for the implementation
// this approach limits breakages when the API changes and increases efficiency
const openaiChatChunkSchema = z.union([
  z.object({
    id: z.string().nullish(),
    created: z.number().nullish(),
    model: z.string().nullish(),
    choices: z.array(
      z.object({
        delta: z
          .object({
            role: z.enum(['assistant']).nullish(),
            content: z.string().nullish(),
            tool_calls: z
              .array(
                z.object({
                  index: z.number(),
                  id: z.string().nullish(),
                  type: z.literal('function').optional(),
                  function: z.object({
                    name: z.string().nullish(),
                    arguments: z.string().nullish(),
                  }),
                }),
              )
              .nullish(),
          })
          .nullish(),
        logprobs: z
          .object({
            content: z
              .array(
                z.object({
                  token: z.string(),
                  logprob: z.number(),
                  top_logprobs: z.array(
                    z.object({
                      token: z.string(),
                      logprob: z.number(),
                    }),
                  ),
                }),
              )
              .nullable(),
          })
          .nullish(),
        finish_reason: z.string().nullable().optional(),
        index: z.number(),
      }),
    ),
    usage: openaiTokenUsageSchema,
  }),
  openaiErrorDataSchema,
]);

function isReasoningModel(modelId: string) {
  return (
    modelId === 'o1' ||
    modelId.startsWith('o1-') ||
    modelId === 'o3' ||
    modelId.startsWith('o3-')
  );
}

function isAudioModel(modelId: string) {
  return modelId.startsWith('gpt-4o-audio-preview');
}

function getSystemMessageMode(modelId: string) {
  if (!isReasoningModel(modelId)) {
    return 'system';
  }

  return (
    reasoningModels[modelId as keyof typeof reasoningModels]
      ?.systemMessageMode ?? 'developer'
  );
}

const reasoningModels = {
  'o1-mini': {
    systemMessageMode: 'remove',
  },
  'o1-mini-2024-09-12': {
    systemMessageMode: 'remove',
  },
  'o1-preview': {
    systemMessageMode: 'remove',
  },
  'o1-preview-2024-09-12': {
    systemMessageMode: 'remove',
  },
  'o3-mini': {
    systemMessageMode: 'developer',
  },
  'o3-mini-2025-01-31': {
    systemMessageMode: 'developer',
  },
} as const;
