import {
  APICallError,
  InvalidResponseDataError,
  LanguageModelV3,
  LanguageModelV3CallWarning,
  LanguageModelV3Content,
  LanguageModelV3FinishReason,
  LanguageModelV3StreamPart,
  SharedV2ProviderMetadata,
} from '@ai-sdk/provider';
import {
  combineHeaders,
  createEventSourceResponseHandler,
  createJsonErrorResponseHandler,
  createJsonResponseHandler,
  FetchFunction,
  generateId,
  isParsableJson,
  parseProviderOptions,
  ParseResult,
  postJsonToApi,
  ResponseHandler,
} from '@ai-sdk/provider-utils';
import { z } from 'zod';
import { convertToOpenAICompatibleChatMessages } from './convert-to-openai-compatible-chat-messages';
import { getResponseMetadata } from './get-response-metadata';
import { mapOpenAICompatibleFinishReason } from './map-openai-compatible-finish-reason';
import {
  ZeroGChatModelId,
  zerogProviderOptions,
  ZeroGProviderOptions,
} from './zerog-chat-options';
import { prepareTools } from './zerog-prepare-tools';

export type ZeroGChatConfig = {
  provider: string;
  headers: () => Record<string, string | undefined>;
  url: (options: { modelId: string; path: string }) => string;
  fetch?: FetchFunction;
  includeUsage?: boolean;
  
  /**
   * 0G Compute broker instance for authentication
   */
  broker?: any;
  
  /**
   * Provider address for the specific model
   */
  providerAddress?: string;
};

export class ZeroGChatLanguageModel implements LanguageModelV3 {
  readonly specificationVersion = 'v3';
  readonly supportsStructuredOutputs = false;

  readonly modelId: ZeroGChatModelId;
  private readonly config: ZeroGChatConfig;
  private readonly failedResponseHandler: ResponseHandler<APICallError>;
  private readonly chunkSchema; // type inferred via constructor

  constructor(
    modelId: ZeroGChatModelId,
    config: ZeroGChatConfig,
  ) {
    this.modelId = modelId;
    this.config = config;

    // initialize error handling:
    this.chunkSchema = createZeroGChatChunkSchema();
    this.failedResponseHandler = createJsonErrorResponseHandler({
      errorSchema: z.object({
        error: z.object({
          message: z.string(),
          type: z.string().optional(),
          code: z.string().optional(),
        }),
      }),
      errorToMessage: (data) => data.error.message,
    });
  }

  get provider(): string {
    return this.config.provider;
  }

  private get providerOptionsName(): string {
    return this.config.provider.split('.')[0].trim();
  }

  get supportedUrls() {
    return {};
  }

  private async getArgs(options: Parameters<LanguageModelV3['doGenerate']>[0]) {
    const {
      mode,
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
      providerOptions,
      headers,
      abortSignal,
    } = options;
    const type = mode.type;

    const warnings: LanguageModelV3CallWarning[] = [];

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

    if (responseFormat != null && responseFormat.type !== 'text') {
      warnings.push({
        type: 'unsupported-setting',
        setting: 'responseFormat',
        details: 'Only text response format is supported.',
      });
    }

    const parsedProviderOptions = parseProviderOptions({
      providerOptions,
      schema: zerogProviderOptions,
    });

    const baseArgs = {
      model: this.modelId,
      messages: convertToOpenAICompatibleChatMessages(prompt),
      stream: type === 'generate-text' ? false : true,
      ...(maxTokens != null && { max_tokens: maxTokens }),
      ...(temperature != null && { temperature }),
      ...(topP != null && { top_p: topP }),
      ...(stopSequences != null && { stop: stopSequences }),
      ...(seed != null && { seed }),
      ...(parsedProviderOptions.user != null && {
        user: parsedProviderOptions.user,
      }),
      ...(parsedProviderOptions.reasoningEffort != null && {
        reasoning_effort: parsedProviderOptions.reasoningEffort,
      }),
    };

    switch (type) {
      case 'generate-text': {
        return {
          args: baseArgs,
          warnings,
        };
      }

      case 'generate-object': {
        throw new Error('Object generation is not supported by 0G Compute');
      }

      case 'generate-object-or-text': {
        throw new Error('Object generation is not supported by 0G Compute');
      }

      default: {
        const _exhaustiveCheck: never = type;
        throw new Error(`Unsupported type: ${_exhaustiveCheck}`);
      }
    }
  }

  async doGenerate(
    options: Parameters<LanguageModelV3['doGenerate']>[0],
  ): Promise<Awaited<ReturnType<LanguageModelV3['doGenerate']>>> {
    const { args, warnings } = await this.getArgs(options);

    // Get authentication headers from 0G broker if available
    let authHeaders: Record<string, string> = {};
    if (this.config.broker && this.config.providerAddress) {
      try {
        const question = JSON.stringify(args.messages);
        authHeaders = await this.config.broker.inference.getRequestHeaders(
          this.config.providerAddress,
          question
        );
      } catch (error) {
        throw new APICallError({
          message: `Failed to get 0G authentication headers: ${error}`,
          cause: error,
        });
      }
    }

    const { responseHeaders, value: response } = await postJsonToApi({
      url: this.config.url({
        path: '/chat/completions',
        modelId: this.modelId,
      }),
      headers: combineHeaders(this.config.headers(), authHeaders, options.headers),
      body: args,
      failedResponseHandler: this.failedResponseHandler,
      successfulResponseHandler: createJsonResponseHandler(
        zerogChatResponseSchema,
      ),
      abortSignal: options.abortSignal,
      fetch: this.config.fetch,
    });

    const { messages: rawPrompt, ...rawSettings } = args;

    const choice = response.choices[0];

    return {
      text: choice.message.content ?? '',
      toolCalls: [],
      toolResults: [],
      finishReason: mapOpenAICompatibleFinishReason(choice.finish_reason),
      usage: {
        promptTokens: response.usage?.prompt_tokens ?? NaN,
        completionTokens: response.usage?.completion_tokens ?? NaN,
      },
      rawCall: { rawPrompt, rawSettings },
      rawResponse: { headers: responseHeaders },
      response: getResponseMetadata(response),
      warnings,
      request: { body: JSON.stringify(args) },
    };
  }

  async doStream(
    options: Parameters<LanguageModelV3['doStream']>[0],
  ): Promise<Awaited<ReturnType<LanguageModelV3['doStream']>>> {
    const { args, warnings } = await this.getArgs(options);

    // Get authentication headers from 0G broker if available
    let authHeaders: Record<string, string> = {};
    if (this.config.broker && this.config.providerAddress) {
      try {
        const question = JSON.stringify(args.messages);
        authHeaders = await this.config.broker.inference.getRequestHeaders(
          this.config.providerAddress,
          question
        );
      } catch (error) {
        throw new APICallError({
          message: `Failed to get 0G authentication headers: ${error}`,
          cause: error,
        });
      }
    }

    const { responseHeaders, value: response } = await postJsonToApi({
      url: this.config.url({
        path: '/chat/completions',
        modelId: this.modelId,
      }),
      headers: combineHeaders(this.config.headers(), authHeaders, options.headers),
      body: args,
      failedResponseHandler: this.failedResponseHandler,
      successfulResponseHandler: createEventSourceResponseHandler(
        this.chunkSchema,
      ),
      abortSignal: options.abortSignal,
      fetch: this.config.fetch,
    });

    const { messages: rawPrompt, ...rawSettings } = args;

    let finishReason: LanguageModelV3FinishReason = 'unknown';
    let usage: { promptTokens: number; completionTokens: number } = {
      promptTokens: Number.NaN,
      completionTokens: Number.NaN,
    };
    let isFirstChunk = true;
    const prefixMap = new Map<number, string>();

    return {
      stream: response.pipeThrough(
        new TransformStream<
          ParseResult<z.infer<typeof this.chunkSchema>>,
          LanguageModelV3StreamPart
        >({
          transform(chunk, controller): void {
            if (!chunk.success) {
              finishReason = 'error';
              controller.enqueue({ type: 'error', error: chunk.error });
              return;
            }

            const value = chunk.value;

            if (value.type === 'error') {
              finishReason = 'error';
              controller.enqueue({ type: 'error', error: value.error });
              return;
            }

            if (value.type !== 'chunk') {
              return;
            }

            const choice = value.chunk.choices[0];

            if (choice?.finish_reason != null) {
              finishReason = mapOpenAICompatibleFinishReason(
                choice.finish_reason,
              );
            }

            if (value.chunk.usage != null) {
              usage = {
                promptTokens: value.chunk.usage.prompt_tokens ?? NaN,
                completionTokens: value.chunk.usage.completion_tokens ?? NaN,
              };
            }

            const delta = choice.delta;

            if (delta.content != null) {
              controller.enqueue({
                type: 'text-delta',
                textDelta: delta.content,
              });
            }

            if (isFirstChunk) {
              isFirstChunk = false;
              controller.enqueue({
                type: 'response-metadata',
                ...getResponseMetadata(value.chunk),
              });
            }
          },

          flush(controller) {
            controller.enqueue({
              type: 'finish',
              finishReason,
              usage,
            });
          },
        }),
      ),
      rawCall: { rawPrompt, rawSettings },
      rawResponse: { headers: responseHeaders },
      warnings,
      request: { body: JSON.stringify(args) },
    };
  }
}

// Response schemas
const zerogChatResponseSchema = z.object({
  id: z.string().nullish(),
  object: z.literal('chat.completion').nullish(),
  created: z.number().nullish(),
  model: z.string().nullish(),
  choices: z.array(
    z.object({
      message: z.object({
        role: z.literal('assistant').nullish(),
        content: z.string().nullish(),
      }),
      index: z.number().nullish(),
      finish_reason: z.string().nullish(),
    }),
  ),
  usage: z
    .object({
      prompt_tokens: z.number().nullish(),
      completion_tokens: z.number().nullish(),
      total_tokens: z.number().nullish(),
    })
    .nullish(),
});

function createZeroGChatChunkSchema() {
  return z.discriminatedUnion('type', [
    z.object({
      type: z.literal('error'),
      error: z.instanceof(Error),
    }),
    z.object({
      type: z.literal('chunk'),
      chunk: z.object({
        id: z.string().nullish(),
        object: z.literal('chat.completion.chunk').nullish(),
        created: z.number().nullish(),
        model: z.string().nullish(),
        choices: z.array(
          z.object({
            delta: z.object({
              role: z.enum(['assistant']).nullish(),
              content: z.string().nullish(),
            }),
            index: z.number().nullish(),
            finish_reason: z.string().nullish(),
          }),
        ),
        usage: z
          .object({
            prompt_tokens: z.number().nullish(),
            completion_tokens: z.number().nullish(),
            total_tokens: z.number().nullish(),
          })
          .nullish(),
      }),
    }),
  ]);
}
