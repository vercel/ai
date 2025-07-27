import {
  LanguageModelV2,
  LanguageModelV2CallWarning,
  LanguageModelV2Content,
  LanguageModelV2FinishReason,
  LanguageModelV2StreamPart,
  LanguageModelV2Usage,
} from '@ai-sdk/provider';
import {
  combineHeaders,
  createEventSourceResponseHandler,
  createJsonResponseHandler,
  FetchFunction,
  parseProviderOptions,
  ParseResult,
  postJsonToApi,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';
import { convertToXaiChatMessages } from './convert-to-xai-chat-messages';
import { getResponseMetadata } from './get-response-metadata';
import { mapXaiFinishReason } from './map-xai-finish-reason';
import { XaiChatModelId, xaiProviderOptions } from './xai-chat-options';
import { xaiFailedResponseHandler } from './xai-error';
import { prepareTools } from './xai-prepare-tools';

type XaiChatConfig = {
  provider: string;
  baseURL: string | undefined;
  headers: () => Record<string, string | undefined>;
  generateId: () => string;
  fetch?: FetchFunction;
};

export class XaiChatLanguageModel implements LanguageModelV2 {
  readonly specificationVersion = 'v2';

  readonly modelId: XaiChatModelId;

  private readonly config: XaiChatConfig;

  constructor(modelId: XaiChatModelId, config: XaiChatConfig) {
    this.modelId = modelId;
    this.config = config;
  }

  get provider(): string {
    return this.config.provider;
  }

  readonly supportedUrls: Record<string, RegExp[]> = {
    'image/*': [/^https?:\/\/.*$/],
  };

  private async getArgs({
    prompt,
    maxOutputTokens,
    temperature,
    topP,
    topK,
    frequencyPenalty,
    presencePenalty,
    stopSequences,
    seed,
    responseFormat,
    providerOptions,
    tools,
    toolChoice,
  }: Parameters<LanguageModelV2['doGenerate']>[0]) {
    const warnings: LanguageModelV2CallWarning[] = [];

    // parse xai-specific provider options
    const options =
      (await parseProviderOptions({
        provider: 'xai',
        providerOptions,
        schema: xaiProviderOptions,
      })) ?? {};

    // check for unsupported parameters
    if (topK != null) {
      warnings.push({
        type: 'unsupported-setting',
        setting: 'topK',
      });
    }

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

    if (stopSequences != null) {
      warnings.push({
        type: 'unsupported-setting',
        setting: 'stopSequences',
      });
    }

    if (
      responseFormat != null &&
      responseFormat.type === 'json' &&
      responseFormat.schema != null
    ) {
      warnings.push({
        type: 'unsupported-setting',
        setting: 'responseFormat',
        details: 'JSON response format schema is not supported',
      });
    }

    // convert ai sdk messages to xai format
    const { messages, warnings: messageWarnings } =
      convertToXaiChatMessages(prompt);
    warnings.push(...messageWarnings);

    // prepare tools for xai
    const {
      tools: xaiTools,
      toolChoice: xaiToolChoice,
      toolWarnings,
    } = prepareTools({
      tools,
      toolChoice,
    });
    warnings.push(...toolWarnings);

    const baseArgs = {
      // model id
      model: this.modelId,

      // standard generation settings
      max_tokens: maxOutputTokens,
      temperature,
      top_p: topP,
      seed,
      reasoning_effort: options.reasoningEffort,

      // response format
      response_format:
        responseFormat?.type === 'json'
          ? responseFormat.schema != null
            ? {
                type: 'json_schema',
                json_schema: {
                  name: responseFormat.name ?? 'response',
                  schema: responseFormat.schema,
                  strict: true,
                },
              }
            : { type: 'json_object' }
          : undefined,

      // search parameters
      search_parameters: options.searchParameters
        ? {
            mode: options.searchParameters.mode,
            return_citations: options.searchParameters.returnCitations,
            from_date: options.searchParameters.fromDate,
            to_date: options.searchParameters.toDate,
            max_search_results: options.searchParameters.maxSearchResults,
            sources: options.searchParameters.sources?.map(source => ({
              type: source.type,
              ...(source.type === 'web' && {
                country: source.country,
                excluded_websites: source.excludedWebsites,
                allowed_websites: source.allowedWebsites,
                safe_search: source.safeSearch,
              }),
              ...(source.type === 'x' && {
                x_handles: source.xHandles,
              }),
              ...(source.type === 'news' && {
                country: source.country,
                excluded_websites: source.excludedWebsites,
                safe_search: source.safeSearch,
              }),
              ...(source.type === 'rss' && {
                links: source.links,
              }),
            })),
          }
        : undefined,

      // messages in xai format
      messages,

      // tools in xai format
      tools: xaiTools,
      tool_choice: xaiToolChoice,
    };

    return {
      args: baseArgs,
      warnings,
    };
  }

  async doGenerate(
    options: Parameters<LanguageModelV2['doGenerate']>[0],
  ): Promise<Awaited<ReturnType<LanguageModelV2['doGenerate']>>> {
    const { args: body, warnings } = await this.getArgs(options);

    const {
      responseHeaders,
      value: response,
      rawValue: rawResponse,
    } = await postJsonToApi({
      url: `${this.config.baseURL ?? 'https://api.x.ai/v1'}/chat/completions`,
      headers: combineHeaders(this.config.headers(), options.headers),
      body,
      failedResponseHandler: xaiFailedResponseHandler,
      successfulResponseHandler: createJsonResponseHandler(
        xaiChatResponseSchema,
      ),
      abortSignal: options.abortSignal,
      fetch: this.config.fetch,
    });

    const choice = response.choices[0];
    const content: Array<LanguageModelV2Content> = [];

    // extract text content
    if (choice.message.content != null && choice.message.content.length > 0) {
      let text = choice.message.content;

      // skip if this content duplicates the last assistant message
      const lastMessage = body.messages[body.messages.length - 1];
      if (lastMessage?.role === 'assistant' && text === lastMessage.content) {
        text = '';
      }

      if (text.length > 0) {
        content.push({ type: 'text', text });
      }
    }

    // extract reasoning content
    if (
      choice.message.reasoning_content != null &&
      choice.message.reasoning_content.length > 0
    ) {
      content.push({
        type: 'reasoning',
        text: choice.message.reasoning_content,
      });
    }

    // extract tool calls
    if (choice.message.tool_calls != null) {
      for (const toolCall of choice.message.tool_calls) {
        content.push({
          type: 'tool-call',
          toolCallId: toolCall.id,
          toolName: toolCall.function.name,
          input: toolCall.function.arguments,
        });
      }
    }

    // extract citations
    if (response.citations != null) {
      for (const url of response.citations) {
        content.push({
          type: 'source',
          sourceType: 'url',
          id: this.config.generateId(),
          url,
        });
      }
    }

    return {
      content,
      finishReason: mapXaiFinishReason(choice.finish_reason),
      usage: {
        inputTokens: response.usage.prompt_tokens,
        outputTokens: response.usage.completion_tokens,
        totalTokens: response.usage.total_tokens,
        reasoningTokens:
          response.usage.completion_tokens_details?.reasoning_tokens ??
          undefined,
      },
      request: { body },
      response: {
        ...getResponseMetadata(response),
        headers: responseHeaders,
        body: rawResponse,
      },
      warnings,
    };
  }

  async doStream(
    options: Parameters<LanguageModelV2['doStream']>[0],
  ): Promise<Awaited<ReturnType<LanguageModelV2['doStream']>>> {
    const { args, warnings } = await this.getArgs(options);
    const body = {
      ...args,
      stream: true,
      stream_options: {
        include_usage: true,
      },
    };

    const { responseHeaders, value: response } = await postJsonToApi({
      url: `${this.config.baseURL ?? 'https://api.x.ai/v1'}/chat/completions`,
      headers: combineHeaders(this.config.headers(), options.headers),
      body,
      failedResponseHandler: xaiFailedResponseHandler,
      successfulResponseHandler:
        createEventSourceResponseHandler(xaiChatChunkSchema),
      abortSignal: options.abortSignal,
      fetch: this.config.fetch,
    });

    let finishReason: LanguageModelV2FinishReason = 'unknown';
    const usage: LanguageModelV2Usage = {
      inputTokens: undefined,
      outputTokens: undefined,
      totalTokens: undefined,
    };
    let isFirstChunk = true;
    const contentBlocks: Record<string, { type: 'text' | 'reasoning' }> = {};
    const lastReasoningDeltas: Record<string, string> = {};

    const self = this;

    return {
      stream: response.pipeThrough(
        new TransformStream<
          ParseResult<z.infer<typeof xaiChatChunkSchema>>,
          LanguageModelV2StreamPart
        >({
          start(controller) {
            controller.enqueue({ type: 'stream-start', warnings });
          },

          transform(chunk, controller) {
            // Emit raw chunk if requested (before anything else)
            if (options.includeRawChunks) {
              controller.enqueue({ type: 'raw', rawValue: chunk.rawValue });
            }

            if (!chunk.success) {
              controller.enqueue({ type: 'error', error: chunk.error });
              return;
            }

            const value = chunk.value;

            // emit response metadata on first chunk
            if (isFirstChunk) {
              controller.enqueue({
                type: 'response-metadata',
                ...getResponseMetadata(value),
              });
              isFirstChunk = false;
            }

            // emit citations if present (they come in the last chunk according to docs)
            if (value.citations != null) {
              for (const url of value.citations) {
                controller.enqueue({
                  type: 'source',
                  sourceType: 'url',
                  id: self.config.generateId(),
                  url,
                });
              }
            }

            // update usage if present
            if (value.usage != null) {
              usage.inputTokens = value.usage.prompt_tokens;
              usage.outputTokens = value.usage.completion_tokens;
              usage.totalTokens = value.usage.total_tokens;
              usage.reasoningTokens =
                value.usage.completion_tokens_details?.reasoning_tokens ??
                undefined;
            }

            const choice = value.choices[0];

            // update finish reason if present
            if (choice?.finish_reason != null) {
              finishReason = mapXaiFinishReason(choice.finish_reason);
            }

            // exit if no delta to process
            if (choice?.delta == null) {
              return;
            }

            const delta = choice.delta;
            const choiceIndex = choice.index;

            // process text content
            if (delta.content != null && delta.content.length > 0) {
              const textContent = delta.content;

              // skip if this content duplicates the last assistant message
              const lastMessage = body.messages[body.messages.length - 1];
              if (
                lastMessage?.role === 'assistant' &&
                textContent === lastMessage.content
              ) {
                return;
              }

              const blockId = `text-${value.id || choiceIndex}`;

              if (contentBlocks[blockId] == null) {
                contentBlocks[blockId] = { type: 'text' };
                controller.enqueue({
                  type: 'text-start',
                  id: blockId,
                });
              }

              controller.enqueue({
                type: 'text-delta',
                id: blockId,
                delta: textContent,
              });
            }

            // process reasoning content
            if (
              delta.reasoning_content != null &&
              delta.reasoning_content.length > 0
            ) {
              const blockId = `reasoning-${value.id || choiceIndex}`;

              // skip if this reasoning content duplicates the last delta
              if (lastReasoningDeltas[blockId] === delta.reasoning_content) {
                return;
              }
              lastReasoningDeltas[blockId] = delta.reasoning_content;

              if (contentBlocks[blockId] == null) {
                contentBlocks[blockId] = { type: 'reasoning' };
                controller.enqueue({
                  type: 'reasoning-start',
                  id: blockId,
                });
              }

              controller.enqueue({
                type: 'reasoning-delta',
                id: blockId,
                delta: delta.reasoning_content,
              });
            }

            // process tool calls
            if (delta.tool_calls != null) {
              for (const toolCall of delta.tool_calls) {
                // xai tool calls come in one piece (like mistral)
                const toolCallId = toolCall.id;

                controller.enqueue({
                  type: 'tool-input-start',
                  id: toolCallId,
                  toolName: toolCall.function.name,
                });

                controller.enqueue({
                  type: 'tool-input-delta',
                  id: toolCallId,
                  delta: toolCall.function.arguments,
                });

                controller.enqueue({
                  type: 'tool-input-end',
                  id: toolCallId,
                });

                controller.enqueue({
                  type: 'tool-call',
                  toolCallId,
                  toolName: toolCall.function.name,
                  input: toolCall.function.arguments,
                });
              }
            }
          },

          flush(controller) {
            for (const [blockId, block] of Object.entries(contentBlocks)) {
              controller.enqueue({
                type: block.type === 'text' ? 'text-end' : 'reasoning-end',
                id: blockId,
              });
            }

            controller.enqueue({ type: 'finish', finishReason, usage });
          },
        }),
      ),
      request: { body },
      response: { headers: responseHeaders },
    };
  }
}

// XAI API Response Schemas
const xaiUsageSchema = z.object({
  prompt_tokens: z.number(),
  completion_tokens: z.number(),
  total_tokens: z.number(),
  completion_tokens_details: z
    .object({
      reasoning_tokens: z.number().nullish(),
    })
    .nullish(),
});

const xaiChatResponseSchema = z.object({
  id: z.string().nullish(),
  created: z.number().nullish(),
  model: z.string().nullish(),
  choices: z.array(
    z.object({
      message: z.object({
        role: z.literal('assistant'),
        content: z.string().nullish(),
        reasoning_content: z.string().nullish(),
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
      index: z.number(),
      finish_reason: z.string().nullish(),
    }),
  ),
  object: z.literal('chat.completion'),
  usage: xaiUsageSchema,
  citations: z.array(z.string().url()).nullish(),
});

const xaiChatChunkSchema = z.object({
  id: z.string().nullish(),
  created: z.number().nullish(),
  model: z.string().nullish(),
  choices: z.array(
    z.object({
      delta: z.object({
        role: z.enum(['assistant']).optional(),
        content: z.string().nullish(),
        reasoning_content: z.string().nullish(),
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
  usage: xaiUsageSchema.nullish(),
  citations: z.array(z.string().url()).nullish(),
});
