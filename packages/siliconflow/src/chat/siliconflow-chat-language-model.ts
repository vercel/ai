import type {
  APICallError,
  LanguageModelV4,
  LanguageModelV4CallOptions,
  LanguageModelV4Content,
  LanguageModelV4FinishReason,
  LanguageModelV4GenerateResult,
  LanguageModelV4StreamPart,
  LanguageModelV4StreamResult,
  SharedV4Warning,
} from '@ai-sdk/provider';
import {
  combineHeaders,
  createEventSourceResponseHandler,
  createJsonErrorResponseHandler,
  createJsonResponseHandler,
  generateId,
  parseProviderOptions,
  postJsonToApi,
  serializeModelOptions,
  StreamingToolCallTracker,
  WORKFLOW_SERIALIZE,
  WORKFLOW_DESERIALIZE,
  type FetchFunction,
  type InferSchema,
  type ParseResult,
  type ResponseHandler,
} from '@ai-sdk/provider-utils';
import { convertToSiliconFlowChatMessages } from './convert-to-siliconflow-messages';
import { convertSiliconFlowUsage } from './convert-to-siliconflow-usage';
import {
  siliconflowChatChunkSchema,
  siliconflowChatResponseSchema,
  siliconFlowErrorSchema,
  type SiliconFlowChatTokenUsage,
} from './siliconflow-chat-types';
import {
  siliconFlowLanguageModelChatOptions,
  type SiliconFlowChatModelId,
} from './siliconflow-chat-options';
import { prepareTools } from './siliconflow-prepare-tools';
import { getResponseMetadata } from './get-response-metadata';
import { mapSiliconFlowFinishReason } from './map-siliconflow-finish-reason';

export type SiliconFlowChatConfig = {
  provider: string;
  headers?: () => Record<string, string | undefined>;
  url: (options: { modelId: string; path: string }) => string;
  fetch?: FetchFunction;
};

export class SiliconFlowChatLanguageModel implements LanguageModelV4 {
  readonly specificationVersion = 'v4';

  readonly modelId: SiliconFlowChatModelId;
  readonly supportedUrls = {};

  private readonly config: SiliconFlowChatConfig;
  private readonly failedResponseHandler: ResponseHandler<APICallError>;

  static [WORKFLOW_SERIALIZE](model: SiliconFlowChatLanguageModel) {
    return serializeModelOptions({
      modelId: model.modelId,
      config: model.config,
    });
  }

  static [WORKFLOW_DESERIALIZE](options: {
    modelId: SiliconFlowChatModelId;
    config: SiliconFlowChatConfig;
  }) {
    return new SiliconFlowChatLanguageModel(options.modelId, options.config);
  }

  constructor(modelId: SiliconFlowChatModelId, config: SiliconFlowChatConfig) {
    this.modelId = modelId;
    this.config = config;

    this.failedResponseHandler = createJsonErrorResponseHandler({
      errorSchema: siliconFlowErrorSchema,
      errorToMessage: (error: InferSchema<typeof siliconFlowErrorSchema>) =>
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
  }: LanguageModelV4CallOptions) {
    const siliconFlowOptions =
      (await parseProviderOptions({
        provider: this.providerOptionsName,
        providerOptions,
        schema: siliconFlowLanguageModelChatOptions,
      })) ?? {};

    const { messages, warnings } = convertToSiliconFlowChatMessages({
      prompt,
      responseFormat,
    });
    const allWarnings: SharedV4Warning[] = [...warnings];

    if (topK != null) {
      allWarnings.push({ type: 'unsupported', feature: 'topK' });
    }

    if (seed != null) {
      allWarnings.push({ type: 'unsupported', feature: 'seed' });
    }

    const {
      tools: siliconFlowTools,
      toolChoice: siliconFlowToolChoices,
      toolWarnings,
    } = prepareTools({
      tools,
      toolChoice,
    });

    return {
      args: {
        model: this.modelId,
        max_tokens: maxOutputTokens,
        temperature,
        top_p: topP,
        frequency_penalty: frequencyPenalty,
        presence_penalty: presencePenalty,
        response_format:
          responseFormat?.type === 'json' ? { type: 'json_object' } : undefined,
        stop: stopSequences,
        messages,
        tools: siliconFlowTools,
        tool_choice: siliconFlowToolChoices,
        // SiliconFlow-specific options:
        ...(siliconFlowOptions.enableThinking != null && {
          enable_thinking: siliconFlowOptions.enableThinking,
        }),
        ...(siliconFlowOptions.thinkingBudget != null && {
          thinking_budget: siliconFlowOptions.thinkingBudget,
        }),
        ...(siliconFlowOptions.minP != null && {
          min_p: siliconFlowOptions.minP,
        }),
      },
      warnings: [...allWarnings, ...toolWarnings],
    };
  }

  async doGenerate(
    options: LanguageModelV4CallOptions,
  ): Promise<LanguageModelV4GenerateResult> {
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
      headers: combineHeaders(this.config.headers?.(), options.headers),
      body: args,
      failedResponseHandler: this.failedResponseHandler,
      successfulResponseHandler: createJsonResponseHandler(
        siliconflowChatResponseSchema,
      ),
      abortSignal: options.abortSignal,
      fetch: this.config.fetch,
    });

    const choice = responseBody.choices[0];
    const content: Array<LanguageModelV4Content> = [];

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
        unified: mapSiliconFlowFinishReason(choice.finish_reason),
        raw: choice.finish_reason ?? undefined,
      },
      usage: convertSiliconFlowUsage(responseBody.usage),
      providerMetadata: {
        [this.providerOptionsName]: {
          promptCacheHitTokens: responseBody.usage?.prompt_cache_hit_tokens,
          promptCacheMissTokens: responseBody.usage?.prompt_cache_miss_tokens,
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
    options: LanguageModelV4CallOptions,
  ): Promise<LanguageModelV4StreamResult> {
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
      headers: combineHeaders(this.config.headers?.(), options.headers),
      body,
      failedResponseHandler: this.failedResponseHandler,
      successfulResponseHandler: createEventSourceResponseHandler(
        siliconflowChatChunkSchema,
      ),
      abortSignal: options.abortSignal,
      fetch: this.config.fetch,
    });

    let toolCallTracker: StreamingToolCallTracker;

    let finishReason: LanguageModelV4FinishReason = {
      unified: 'other',
      raw: undefined,
    };
    let usage: SiliconFlowChatTokenUsage | undefined = undefined;
    let isFirstChunk = true;
    const providerOptionsName = this.providerOptionsName;
    let isActiveReasoning = false;
    let isActiveText = false;

    return {
      stream: response.pipeThrough(
        new TransformStream<
          ParseResult<InferSchema<typeof siliconflowChatChunkSchema>>,
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

            const choice = value.choices[0];

            if (choice?.finish_reason != null) {
              finishReason = {
                unified: mapSiliconFlowFinishReason(choice.finish_reason),
                raw: choice.finish_reason,
              };
            }

            if (choice?.delta == null) {
              return;
            }

            const delta = choice.delta;

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
                toolCallTracker.processDelta(toolCallDelta);
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

            toolCallTracker.flush();

            controller.enqueue({
              type: 'finish',
              finishReason,
              usage: convertSiliconFlowUsage(usage),
              providerMetadata: {
                [providerOptionsName]: {
                  promptCacheHitTokens:
                    usage?.prompt_cache_hit_tokens ?? undefined,
                  promptCacheMissTokens:
                    usage?.prompt_cache_miss_tokens ?? undefined,
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
