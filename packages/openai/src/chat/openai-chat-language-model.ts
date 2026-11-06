import {
  InvalidResponseDataError,
  type LanguageModelV3,
  type LanguageModelV3CallOptions,
  type LanguageModelV3Content,
  type LanguageModelV3FinishReason,
  type LanguageModelV3GenerateResult,
  type LanguageModelV3StreamPart,
  type LanguageModelV3StreamResult,
  type SharedV3ProviderMetadata,
  type SharedV3Warning,
} from '@ai-sdk/provider';
import {
  StreamingToolCallTracker,
  combineHeaders,
  createEventSourceResponseHandler,
  createJsonResponseHandler,
  generateId,
  parseProviderOptions,
  postJsonToApi,
  type FetchFunction,
  type ParseResult,
} from '@ai-sdk/provider-utils';
import { openaiFailedResponseHandler } from '../openai-error';
import { getOpenAILanguageModelCapabilities } from '../openai-language-model-capabilities';
import { normalizeOpenAIJsonSchema } from '../normalize-openai-json-schema';
import { throwIfOpenAIStreamErrorBeforeOutput } from '../openai-stream-error';
import {
  convertOpenAIChatUsage,
  type OpenAIChatUsage,
} from './convert-openai-chat-usage';
import { convertToOpenAIChatMessages } from './convert-to-openai-chat-messages';
import { getResponseMetadata } from './get-response-metadata';
import { mapOpenAIFinishReason } from './map-openai-finish-reason';
import {
  openaiChatChunkSchema,
  openaiChatResponseSchema,
  type OpenAIChatChunk,
} from './openai-chat-api';
import {
  openaiLanguageModelChatOptions,
  type OpenAIChatModelId,
} from './openai-chat-options';
import { prepareChatTools } from './openai-chat-prepare-tools';

type OpenAIChatLogprob = NonNullable<
  NonNullable<
    Extract<
      OpenAIChatChunk,
      { choices: unknown }
    >['choices'][number]['logprobs']
  >['content']
>[number];

type OpenAIChatConfig = {
  provider: string;
  headers: () => Record<string, string | undefined>;
  url: (options: { modelId: string; path: string }) => string;
  fetch?: FetchFunction;
};

export class OpenAIChatLanguageModel implements LanguageModelV3 {
  readonly specificationVersion = 'v3';

  readonly modelId: OpenAIChatModelId;

  readonly supportedUrls = {
    'image/*': [/^https?:\/\/.*$/],
  };

  private readonly config: OpenAIChatConfig;

  constructor(modelId: OpenAIChatModelId, config: OpenAIChatConfig) {
    this.modelId = modelId;
    this.config = config;
  }

  get provider(): string {
    return this.config.provider;
  }

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
    tools,
    toolChoice,
    providerOptions,
  }: LanguageModelV3CallOptions) {
    const warnings: SharedV3Warning[] = [];

    // Parse provider options
    const openaiOptions =
      (await parseProviderOptions({
        provider: 'openai',
        providerOptions,
        schema: openaiLanguageModelChatOptions,
      })) ?? {};

    const modelCapabilities = getOpenAILanguageModelCapabilities(this.modelId);
    const isReasoningModel =
      openaiOptions.forceReasoning ?? modelCapabilities.isReasoningModel;

    let resolvedReasoningEffort = openaiOptions.reasoningEffort;

    if (
      resolvedReasoningEffort != null &&
      modelCapabilities.supportedReasoningEfforts != null &&
      !modelCapabilities.supportedReasoningEfforts.includes(
        resolvedReasoningEffort,
      )
    ) {
      warnings.push({
        type: 'unsupported',
        feature: 'reasoningEffort',
        details: `${this.modelId} only supports the following reasoning efforts: ${modelCapabilities.supportedReasoningEfforts.join(', ')}`,
      });
      resolvedReasoningEffort = undefined;
    }

    if (topK != null) {
      warnings.push({ type: 'unsupported', feature: 'topK' });
    }

    const { messages, warnings: messageWarnings } = convertToOpenAIChatMessages(
      {
        prompt,
        systemMessageMode:
          openaiOptions.systemMessageMode ??
          (isReasoningModel
            ? 'developer'
            : modelCapabilities.systemMessageMode),
      },
    );

    warnings.push(...messageWarnings);

    const strictJsonSchema = openaiOptions.strictJsonSchema ?? true;

    const baseArgs = {
      // model id:
      model: this.modelId,

      // model specific settings:
      logit_bias: openaiOptions.logitBias,
      logprobs:
        openaiOptions.logprobs === true ||
        typeof openaiOptions.logprobs === 'number'
          ? true
          : undefined,
      top_logprobs:
        typeof openaiOptions.logprobs === 'number'
          ? openaiOptions.logprobs
          : typeof openaiOptions.logprobs === 'boolean'
            ? openaiOptions.logprobs
              ? 0
              : undefined
            : undefined,
      user: openaiOptions.user,
      parallel_tool_calls: openaiOptions.parallelToolCalls,

      // standardized settings:
      max_tokens: maxOutputTokens,
      temperature,
      top_p: topP,
      frequency_penalty: frequencyPenalty,
      presence_penalty: presencePenalty,
      response_format:
        responseFormat?.type === 'json'
          ? responseFormat.schema != null
            ? {
                type: 'json_schema',
                json_schema: {
                  schema: normalizeOpenAIJsonSchema(responseFormat.schema),
                  strict: strictJsonSchema,
                  name: responseFormat.name ?? 'response',
                  description: responseFormat.description,
                },
              }
            : { type: 'json_object' }
          : undefined,
      stop: stopSequences,
      seed,
      verbosity: openaiOptions.textVerbosity,

      // openai specific settings:
      // TODO AI SDK 6: remove, we auto-map maxOutputTokens now
      max_completion_tokens: openaiOptions.maxCompletionTokens,
      store: openaiOptions.store,
      metadata: openaiOptions.metadata,
      prediction: openaiOptions.prediction,
      reasoning_effort: resolvedReasoningEffort,
      service_tier: openaiOptions.serviceTier,
      prompt_cache_key: openaiOptions.promptCacheKey,
      prompt_cache_options: openaiOptions.promptCacheOptions,
      prompt_cache_retention: openaiOptions.promptCacheRetention,
      safety_identifier: openaiOptions.safetyIdentifier,

      // messages:
      messages,
    };

    if (
      modelCapabilities.supportedReasoningEfforts != null &&
      baseArgs.prompt_cache_retention != null
    ) {
      baseArgs.prompt_cache_retention = undefined;
      warnings.push({
        type: 'unsupported',
        feature: 'promptCacheRetention',
        details:
          'promptCacheRetention is not supported by GPT-6 and later models; use promptCacheOptions instead',
      });
    }

    // remove unsupported settings for reasoning models
    // see https://platform.openai.com/docs/guides/reasoning#limitations
    if (isReasoningModel) {
      // when reasoning effort is none, gpt-5.1 models allow temperature, topP, logprobs
      //  https://platform.openai.com/docs/guides/latest-model#gpt-5-1-parameter-compatibility
      if (
        openaiOptions.reasoningEffort !== 'none' ||
        !modelCapabilities.supportsNonReasoningParameters
      ) {
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
        if (baseArgs.logprobs != null) {
          baseArgs.logprobs = undefined;
          warnings.push({
            type: 'other',
            message: 'logprobs is not supported for reasoning models',
          });
        }
      }

      if (baseArgs.frequency_penalty != null) {
        baseArgs.frequency_penalty = undefined;
        warnings.push({
          type: 'unsupported',
          feature: 'frequencyPenalty',
          details: 'frequencyPenalty is not supported for reasoning models',
        });
      }
      if (baseArgs.presence_penalty != null) {
        baseArgs.presence_penalty = undefined;
        warnings.push({
          type: 'unsupported',
          feature: 'presencePenalty',
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
    } else if (
      this.modelId.startsWith('gpt-4o-search-preview') ||
      this.modelId.startsWith('gpt-4o-mini-search-preview')
    ) {
      if (baseArgs.temperature != null) {
        baseArgs.temperature = undefined;
        warnings.push({
          type: 'unsupported',
          feature: 'temperature',
          details:
            'temperature is not supported for the search preview models and has been removed.',
        });
      }
    }

    // Validate flex processing support
    if (
      openaiOptions.serviceTier === 'flex' &&
      !modelCapabilities.supportsFlexProcessing
    ) {
      warnings.push({
        type: 'unsupported',
        feature: 'serviceTier',
        details:
          'flex processing is only available for o3, o4-mini, and gpt-5 models',
      });
      baseArgs.service_tier = undefined;
    }

    // Validate priority processing support
    if (
      (openaiOptions.serviceTier === 'priority' ||
        openaiOptions.serviceTier === 'fast') &&
      !modelCapabilities.supportsPriorityProcessing
    ) {
      warnings.push({
        type: 'unsupported',
        feature: 'serviceTier',
        details:
          'priority processing is only available for supported models (gpt-4, gpt-5, gpt-5-mini, o3, o4-mini) and requires Enterprise access. gpt-5-nano is not supported',
      });
      baseArgs.service_tier = undefined;
    }

    const {
      tools: openaiTools,
      toolChoice: openaiToolChoice,
      toolWarnings,
    } = prepareChatTools({
      tools,
      toolChoice,
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
    options: LanguageModelV3CallOptions,
  ): Promise<LanguageModelV3GenerateResult> {
    const { args: body, warnings } = await this.getArgs(options);

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

    const choice = response.choices[0];
    if (choice == null) {
      throw new InvalidResponseDataError({
        data: rawResponse,
        message: 'Response did not contain any choices.',
      });
    }

    const content: Array<LanguageModelV3Content> = [];

    // text content. When the model refuses to answer, the API returns the
    // refusal in `refusal` and sets `content` to null, so surface it as text
    // instead of dropping it. Content and refusal are both returned when the
    // model refuses after answering, so keep both:
    const text =
      choice.message.content != null && choice.message.content.length > 0
        ? choice.message.content
        : choice.message.audio?.transcript;
    if (text != null && text.length > 0) {
      content.push({ type: 'text', text });
    }

    const refusal = choice.message.refusal;
    const hasRefusal = refusal != null && refusal.length > 0;
    if (hasRefusal) {
      content.push({ type: 'text', text: refusal });
    }

    // tool calls:
    for (const toolCall of choice.message.tool_calls ?? []) {
      content.push({
        type: 'tool-call' as const,
        toolCallId: toolCall.id ?? generateId(),
        toolName: toolCall.function.name,
        input: toolCall.function.arguments!,
      });
    }

    // annotations/citations:
    for (const annotation of choice.message.annotations ?? []) {
      content.push({
        type: 'source',
        sourceType: 'url',
        id: generateId(),
        url: annotation.url_citation.url,
        title: annotation.url_citation.title,
      });
    }

    // provider metadata:
    const completionTokenDetails = response.usage?.completion_tokens_details;
    const promptTokenDetails = response.usage?.prompt_tokens_details;
    const providerMetadata: SharedV3ProviderMetadata = { openai: {} };
    if (completionTokenDetails?.accepted_prediction_tokens != null) {
      providerMetadata.openai.acceptedPredictionTokens =
        completionTokenDetails?.accepted_prediction_tokens;
    }
    if (completionTokenDetails?.rejected_prediction_tokens != null) {
      providerMetadata.openai.rejectedPredictionTokens =
        completionTokenDetails?.rejected_prediction_tokens;
    }
    // logprobs either follow the text content (content) or the refusal, so
    // combine them in the order the text is emitted above. Explicitly empty
    // logprobs are reported as an empty array, as before:
    const contentLogprobs = choice.logprobs?.content;
    const refusalLogprobs = choice.logprobs?.refusal;
    if (contentLogprobs != null || refusalLogprobs != null) {
      providerMetadata.openai.logprobs = [
        ...(contentLogprobs ?? []),
        ...(refusalLogprobs ?? []),
      ];
    }

    return {
      content,
      finishReason: {
        unified: mapOpenAIFinishReason({
          finishReason: choice.finish_reason,
          hasRefusal,
        }),
        raw: choice.finish_reason ?? undefined,
      },
      usage: convertOpenAIChatUsage(response.usage),
      request: { body },
      response: {
        ...getResponseMetadata(response),
        headers: responseHeaders,
        body: rawResponse,
      },
      warnings,
      providerMetadata,
    };
  }

  async doStream(
    options: LanguageModelV3CallOptions,
  ): Promise<LanguageModelV3StreamResult> {
    const { args, warnings } = await this.getArgs(options);

    const body = {
      ...args,
      stream: true,
      stream_options: {
        include_usage: true,
      },
    };

    const url = this.config.url({
      path: '/chat/completions',
      modelId: this.modelId,
    });

    const { responseHeaders, value: response } = await postJsonToApi({
      url,
      headers: combineHeaders(this.config.headers(), options.headers),
      body,
      failedResponseHandler: openaiFailedResponseHandler,
      successfulResponseHandler: createEventSourceResponseHandler(
        openaiChatChunkSchema,
      ),
      abortSignal: options.abortSignal,
      fetch: this.config.fetch,
    });

    const checkedResponse = await throwIfOpenAIStreamErrorBeforeOutput({
      stream: response,
      getError: chunk => ('error' in chunk ? chunk.error : undefined),
      isOutputChunk: isOpenAIChatOutputChunk,
      url,
      requestBodyValues: body,
      responseHeaders,
    });

    let toolCallTracker: StreamingToolCallTracker;

    let finishReason: LanguageModelV3FinishReason = {
      unified: 'other',
      raw: undefined,
    };
    let usage: OpenAIChatUsage | undefined = undefined;
    let metadataExtracted = false;
    let isActiveText = false;
    let hasRefusal = false;
    let rawFinishReason: string | undefined = undefined;
    let hasLogprobs = false;

    // logprobs of all streamed chunks (content token logprobs followed by
    // refusal token logprobs), collected across chunks:
    const streamedLogprobs: OpenAIChatLogprob[] = [];

    const providerMetadata: SharedV3ProviderMetadata = { openai: {} };

    const result = {
      stream: checkedResponse.pipeThrough(
        new TransformStream<
          ParseResult<OpenAIChatChunk>,
          LanguageModelV3StreamPart
        >({
          start(controller) {
            toolCallTracker = new StreamingToolCallTracker(controller, {
              generateId,
              typeValidation: 'if-present',
            });
            controller.enqueue({ type: 'stream-start', warnings });
          },

          transform(chunk, controller) {
            if (options.includeRawChunks) {
              controller.enqueue({ type: 'raw', rawValue: chunk.rawValue });
            }

            // handle failed chunk parsing / validation:
            if (!chunk.success) {
              finishReason = { unified: 'error', raw: undefined };
              rawFinishReason = undefined;
              controller.enqueue({ type: 'error', error: chunk.error });
              return;
            }

            const value = chunk.value;

            // handle error chunks:
            if ('error' in value) {
              finishReason = { unified: 'error', raw: undefined };
              rawFinishReason = undefined;
              controller.enqueue({ type: 'error', error: value.error });
              return;
            }

            // extract and emit response metadata once. Usually it comes in the first chunk.
            // Azure may prepend a chunk with a `"prompt_filter_results"` key which does not contain other metadata,
            // https://learn.microsoft.com/en-us/azure/ai-foundry/openai/concepts/content-filter-annotations?tabs=powershell
            if (!metadataExtracted) {
              const metadata = getResponseMetadata(value);
              if (Object.values(metadata).some(Boolean)) {
                metadataExtracted = true;
                controller.enqueue({
                  type: 'response-metadata',
                  ...getResponseMetadata(value),
                });
              }
            }

            if (value.usage != null) {
              usage = value.usage;

              if (
                value.usage.completion_tokens_details
                  ?.accepted_prediction_tokens != null
              ) {
                providerMetadata.openai.acceptedPredictionTokens =
                  value.usage.completion_tokens_details?.accepted_prediction_tokens;
              }
              if (
                value.usage.completion_tokens_details
                  ?.rejected_prediction_tokens != null
              ) {
                providerMetadata.openai.rejectedPredictionTokens =
                  value.usage.completion_tokens_details?.rejected_prediction_tokens;
              }
            }

            const choice = value.choices[0];

            // store the raw finish reason and map it in `flush`, after all
            // chunks have been read: some servers send the last delta (which
            // can contain a refusal) in the same chunk as the finish reason,
            // and a refusal turns `stop` into `content-filter`:
            if (choice?.finish_reason != null) {
              rawFinishReason = choice.finish_reason;
            }

            // logprobs either follow the text content (content) or the refusal.
            // They are streamed token by token, so collect the logprobs of all
            // chunks (content logprobs followed by refusal logprobs) and report
            // the complete list at the end of the stream:
            if (choice?.logprobs != null) {
              const contentLogprobs = choice.logprobs.content;
              const refusalLogprobs = choice.logprobs.refusal;

              if (contentLogprobs != null || refusalLogprobs != null) {
                hasLogprobs = true;
                streamedLogprobs.push(
                  ...(contentLogprobs ?? []),
                  ...(refusalLogprobs ?? []),
                );
              }
            }

            if (choice?.delta == null) {
              return;
            }

            const delta = choice.delta;

            // When the model refuses to answer, the API streams the refusal in
            // `refusal` instead of `content`. Content and refusal deltas can
            // both occur, so append each to the same text part instead of
            // dropping one:
            const textDeltas: string[] = [];
            if (delta.content != null && delta.content.length > 0) {
              textDeltas.push(delta.content);
            }
            if (delta.refusal != null && delta.refusal.length > 0) {
              hasRefusal = true;
              textDeltas.push(delta.refusal);
            }
            // empty `content: ""` deltas keep their previous behavior:
            if (textDeltas.length === 0 && delta.content === '') {
              textDeltas.push(delta.content);
            }

            for (const textDelta of textDeltas) {
              if (!isActiveText) {
                controller.enqueue({ type: 'text-start', id: '0' });
                isActiveText = true;
              }

              controller.enqueue({
                type: 'text-delta',
                id: '0',
                delta: textDelta,
              });
            }

            if (delta.tool_calls != null) {
              for (const toolCallDelta of delta.tool_calls) {
                toolCallTracker.processDelta(toolCallDelta);
              }
            }

            // annotations/citations:
            if (delta.annotations != null) {
              for (const annotation of delta.annotations) {
                controller.enqueue({
                  type: 'source',
                  sourceType: 'url',
                  id: generateId(),
                  url: annotation.url_citation.url,
                  title: annotation.url_citation.title,
                });
              }
            }
          },

          flush(controller) {
            if (isActiveText) {
              controller.enqueue({ type: 'text-end', id: '0' });
            }

            toolCallTracker.flush();

            // map the stored finish reason now that all deltas (including
            // refusals that arrived in the same chunk as the finish reason)
            // have been read:
            if (rawFinishReason != null) {
              finishReason = {
                unified: mapOpenAIFinishReason({
                  finishReason: rawFinishReason,
                  hasRefusal,
                }),
                raw: rawFinishReason,
              };
            }

            // report the logprobs of all streamed chunks (content logprobs
            // followed by refusal logprobs), not only the last chunk:
            if (hasLogprobs) {
              providerMetadata.openai.logprobs = streamedLogprobs;
            }

            controller.enqueue({
              type: 'finish',
              finishReason,
              usage: convertOpenAIChatUsage(usage),
              ...(providerMetadata != null ? { providerMetadata } : {}),
            });
          },
        }),
      ),
      request: { body },
      response: { headers: responseHeaders },
    };

    return result;
  }
}

function isOpenAIChatOutputChunk(chunk: OpenAIChatChunk): boolean {
  if ('error' in chunk) {
    return false;
  }

  return chunk.choices.some(choice => {
    const delta = choice.delta;

    return (
      (delta?.content != null && delta.content.length > 0) ||
      (delta?.refusal != null && delta.refusal.length > 0) ||
      (delta?.tool_calls != null && delta.tool_calls.length > 0) ||
      (delta?.annotations != null && delta.annotations.length > 0)
    );
  });
}
