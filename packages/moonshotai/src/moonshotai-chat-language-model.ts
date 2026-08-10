<<<<<<< HEAD
import { OpenAICompatibleChatLanguageModel } from '@ai-sdk/openai-compatible';
import type { OpenAICompatibleChatConfig } from '@ai-sdk/openai-compatible/internal';
import type {
  LanguageModelV3CallOptions,
  LanguageModelV3GenerateResult,
  LanguageModelV3StreamPart,
  LanguageModelV3StreamResult,
=======
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
>>>>>>> b283a6f876 (feat(provider/moonshotai): own the chat implementation, support video input (#18449))
} from '@ai-sdk/provider';
import {
  combineHeaders,
  createEventSourceResponseHandler,
  createJsonErrorResponseHandler,
  createJsonResponseHandler,
  createLanguageModelResponseMetadata as getResponseMetadata,
  generateId,
  isCustomReasoning,
  mapReasoningToProviderEffort,
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
import { convertToMoonshotAIChatMessages } from './convert-to-moonshotai-chat-messages';
import { convertMoonshotAIChatUsage } from './convert-moonshotai-chat-usage';
import { mapMoonshotAIFinishReason } from './map-moonshotai-finish-reason';
import {
  moonshotAIChatChunkSchema,
  moonshotAIChatResponseSchema,
  moonshotAIErrorSchema,
  type MoonshotAIChatTokenUsage,
} from './moonshotai-chat-api-types';
import {
  getModelThinkingKeepSupport,
  moonshotaiLanguageModelOptions,
  type MoonshotAIChatModelId,
} from './moonshotai-chat-options';
import { prepareTools } from './moonshotai-prepare-tools';

export type MoonshotAIChatConfig = {
  provider: string;
  headers?: () => Record<string, string | undefined>;
  url: (options: { modelId: string; path: string }) => string;
  fetch?: FetchFunction;
  includeUsage?: boolean;
  supportsStructuredOutputs?: boolean;
};

export class MoonshotAIChatLanguageModel implements LanguageModelV4 {
  readonly specificationVersion = 'v4';

  readonly modelId: MoonshotAIChatModelId;

  // Moonshot AI does not fetch external URLs; the AI SDK downloads and
  // inlines URL file parts instead. ms:// file references from the Moonshot
  // Files API are passed through natively.
  readonly supportedUrls = {
    'image/*': [/^ms:\/\//],
    'video/*': [/^ms:\/\//],
  };

  private readonly config: MoonshotAIChatConfig;
  private readonly failedResponseHandler: ResponseHandler<APICallError>;

<<<<<<< HEAD
export class MoonshotAIChatLanguageModel extends OpenAICompatibleChatLanguageModel {
  constructor(
    modelId: MoonshotAIChatModelId,
    config: OpenAICompatibleChatConfig,
  ) {
    super(modelId, config);
  }

  async doGenerate(
    options: LanguageModelV3CallOptions,
  ): Promise<LanguageModelV3GenerateResult> {
    const result = await super.doGenerate(options);
=======
  static [WORKFLOW_SERIALIZE](model: MoonshotAIChatLanguageModel) {
    return serializeModelOptions({
      modelId: model.modelId,
      config: model.config,
    });
  }

  static [WORKFLOW_DESERIALIZE](options: {
    modelId: MoonshotAIChatModelId;
    config: MoonshotAIChatConfig;
  }) {
    return new MoonshotAIChatLanguageModel(options.modelId, options.config);
  }

  constructor(modelId: MoonshotAIChatModelId, config: MoonshotAIChatConfig) {
    this.modelId = modelId;
    this.config = config;

    this.failedResponseHandler = createJsonErrorResponseHandler({
      errorSchema: moonshotAIErrorSchema,
      errorToMessage: error => error.error.message,
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
    reasoning,
    providerOptions,
    stopSequences,
    responseFormat,
    seed,
    toolChoice,
    tools,
  }: LanguageModelV4CallOptions) {
    const moonshotOptions =
      (await parseProviderOptions({
        provider: this.providerOptionsName,
        providerOptions,
        schema: moonshotaiLanguageModelOptions,
      })) ?? {};

    const messages = convertToMoonshotAIChatMessages(prompt);

    const allWarnings: SharedV4Warning[] = [];
    if (topK != null) {
      allWarnings.push({ type: 'unsupported', feature: 'topK' });
    }
    if (seed != null) {
      allWarnings.push({ type: 'unsupported', feature: 'seed' });
    }

    const {
      tools: moonshotTools,
      toolChoice: moonshotToolChoice,
      toolWarnings,
    } = prepareTools({ tools, toolChoice });

    // Thinking is configured through explicit provider options only.
    const thinking = moonshotOptions.thinking;

    // Moonshot has no reasoning_history field; the API silently ignores it
    // (verified against the live API). Preserved Thinking maps to
    // thinking.keep, which only accepts 'all' and only on some models
    // (verified: k2.6, k2.7-code, k3 accept it; k2.5 rejects it). Other
    // reasoningHistory values use the server default.
    let keep: 'all' | undefined;
    if (moonshotOptions.reasoningHistory === 'preserved') {
      if (getModelThinkingKeepSupport(this.modelId)) {
        keep = 'all';
      } else {
        allWarnings.push({
          type: 'unsupported',
          feature: `reasoningHistory 'preserved' is not supported by model "${this.modelId}"`,
        });
      }
    }

    // Map the generic reasoning call option to Moonshot's reasoning_effort
    // (explicit provider options win). 'none' cannot disable Moonshot
    // thinking from here; use thinking: { type: 'disabled' } instead.
    if (reasoning === 'none') {
      allWarnings.push({
        type: 'unsupported',
        feature:
          'reasoning "none" (use providerOptions.moonshotai.thinking to control thinking)',
      });
    }
    const reasoningEffort =
      moonshotOptions.reasoningEffort ??
      (isCustomReasoning(reasoning) && reasoning !== 'none'
        ? mapReasoningToProviderEffort({
            reasoning,
            effortMap: {
              minimal: 'low',
              low: 'low',
              medium: 'high',
              high: 'high',
              xhigh: 'max',
            },
            warnings: allWarnings,
          })
        : undefined);

    let response_format: Record<string, unknown> | undefined;
    if (responseFormat?.type === 'json') {
      if (
        this.config.supportsStructuredOutputs === true &&
        responseFormat.schema != null
      ) {
        // kimi-k2.5 produces nonsensical output when the top-level `$schema`
        // keyword injected by the AI SDK is present, even though it otherwise
        // supports structured outputs. Strip it from the schema sent to
        // Moonshot; the full original schema is still used for result
        // validation.
        const { $schema: _$schema, ...schemaWithoutDollarSchema } =
          responseFormat.schema;
        response_format = {
          type: 'json_schema',
          json_schema: {
            name: responseFormat.name ?? 'response',
            schema: schemaWithoutDollarSchema,
            ...(responseFormat.description != null && {
              description: responseFormat.description,
            }),
          },
        };
      } else {
        response_format = { type: 'json_object' };
      }
    }

    return {
      args: {
        model: this.modelId,
        max_tokens: maxOutputTokens,
        temperature,
        top_p: topP,
        frequency_penalty: frequencyPenalty,
        presence_penalty: presencePenalty,
        response_format,
        stop: stopSequences,
        messages,
        tools: moonshotTools,
        tool_choice: moonshotToolChoice,
        ...(thinking != null || keep != null
          ? {
              thinking: {
                ...(thinking?.type != null && { type: thinking.type }),
                ...(thinking?.budgetTokens !== undefined && {
                  budget_tokens: thinking.budgetTokens,
                }),
                ...(keep != null && { keep }),
              },
            }
          : {}),
        ...(reasoningEffort != null && {
          reasoning_effort: reasoningEffort,
        }),
        ...(moonshotOptions.promptCacheKey != null && {
          prompt_cache_key: moonshotOptions.promptCacheKey,
        }),
        ...(moonshotOptions.safetyIdentifier != null && {
          safety_identifier: moonshotOptions.safetyIdentifier,
        }),
      },
      warnings: [...allWarnings, ...toolWarnings],
    };
  }

  async doGenerate(
    options: LanguageModelV4CallOptions,
  ): Promise<LanguageModelV4GenerateResult> {
    const { args, warnings } = await this.getArgs({ ...options });
>>>>>>> b283a6f876 (feat(provider/moonshotai): own the chat implementation, support video input (#18449))

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
        moonshotAIChatResponseSchema,
      ),
      abortSignal: options.abortSignal,
      fetch: this.config.fetch,
    });

    const choice = responseBody.choices[0];
    const content: Array<LanguageModelV4Content> = [];

    // reasoning content (before text):
    const reasoning = choice.message.reasoning_content;
    if (reasoning != null && reasoning.length > 0) {
      content.push({ type: 'reasoning', text: reasoning });
    }

    // tool calls:
    if (choice.message.tool_calls != null) {
      for (const toolCall of choice.message.tool_calls) {
        content.push({
          type: 'tool-call',
          toolCallId: toolCall.id ?? generateId(),
          toolName: toolCall.function.name,
          input: toolCall.function.arguments ?? '',
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
        unified: mapMoonshotAIFinishReason(choice.finish_reason),
        raw: choice.finish_reason ?? undefined,
      },
      usage: convertMoonshotAIChatUsage(responseBody.usage),
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
<<<<<<< HEAD
    options: LanguageModelV3CallOptions,
  ): Promise<LanguageModelV3StreamResult> {
    const result = await super.doStream(options);
=======
    options: LanguageModelV4CallOptions,
  ): Promise<LanguageModelV4StreamResult> {
    const { args, warnings } = await this.getArgs({ ...options });

    const body = {
      ...args,
      stream: true,
      ...(this.config.includeUsage && {
        stream_options: { include_usage: true },
      }),
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
        moonshotAIChatChunkSchema,
      ),
      abortSignal: options.abortSignal,
      fetch: this.config.fetch,
    });

    let toolCallTracker: StreamingToolCallTracker;

    let finishReason: LanguageModelV4FinishReason = {
      unified: 'other',
      raw: undefined,
    };
    let usage: MoonshotAIChatTokenUsage | undefined = undefined;
    let isFirstChunk = true;
    let isActiveReasoning = false;
    let isActiveText = false;
>>>>>>> b283a6f876 (feat(provider/moonshotai): own the chat implementation, support video input (#18449))

    return {
      stream: response.pipeThrough(
        new TransformStream<
<<<<<<< HEAD
          LanguageModelV3StreamPart,
          LanguageModelV3StreamPart
=======
          ParseResult<InferSchema<typeof moonshotAIChatChunkSchema>>,
          LanguageModelV4StreamPart
>>>>>>> b283a6f876 (feat(provider/moonshotai): own the chat implementation, support video input (#18449))
        >({
          start(controller) {
            toolCallTracker = new StreamingToolCallTracker(controller, {
              generateId,
            });
            controller.enqueue({ type: 'stream-start', warnings });
          },

          transform(chunk, controller) {
            // emit raw chunk if requested (before anything else):
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
                unified: mapMoonshotAIFinishReason(choice.finish_reason),
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
              usage: convertMoonshotAIChatUsage(usage),
            });
          },
        }),
      ),
      request: { body },
      response: { headers: responseHeaders },
    };
  }
}
