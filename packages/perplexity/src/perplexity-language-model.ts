import {
  LanguageModelV2,
  LanguageModelV2CallWarning,
  LanguageModelV2Content,
  LanguageModelV2FinishReason,
  LanguageModelV2StreamPart,
  LanguageModelV2Usage,
} from '@ai-sdk/provider';
import {
  FetchFunction,
  ParseResult,
  combineHeaders,
  createEventSourceResponseHandler,
  createJsonErrorResponseHandler,
  createJsonResponseHandler,
  postJsonToApi,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';
import { convertToPerplexityMessages } from './convert-to-perplexity-messages';
import { mapPerplexityFinishReason } from './map-perplexity-finish-reason';
import { PerplexityLanguageModelId } from './perplexity-language-model-options';

type PerplexityChatConfig = {
  baseURL: string;
  headers: () => Record<string, string | undefined>;
  generateId: () => string;
  fetch?: FetchFunction;
};

export class PerplexityLanguageModel implements LanguageModelV2 {
  readonly specificationVersion = 'v2';
  readonly provider = 'perplexity';

  readonly modelId: PerplexityLanguageModelId;

  private readonly config: PerplexityChatConfig;

  constructor(
    modelId: PerplexityLanguageModelId,
    config: PerplexityChatConfig,
  ) {
    this.modelId = modelId;
    this.config = config;
  }

  readonly supportedUrls: Record<string, RegExp[]> = {
    // No URLs are supported.
  };

  private getArgs({
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
  }: Parameters<LanguageModelV2['doGenerate']>[0]) {
    const warnings: LanguageModelV2CallWarning[] = [];

    if (topK != null) {
      warnings.push({
        type: 'unsupported-setting',
        setting: 'topK',
      });
    }

    if (stopSequences != null) {
      warnings.push({
        type: 'unsupported-setting',
        setting: 'stopSequences',
      });
    }

    if (seed != null) {
      warnings.push({
        type: 'unsupported-setting',
        setting: 'seed',
      });
    }

    return {
      args: {
        // model id:
        model: this.modelId,

        // standardized settings:
        frequency_penalty: frequencyPenalty,
        max_tokens: maxOutputTokens,
        presence_penalty: presencePenalty,
        temperature,
        top_k: topK,
        top_p: topP,

        // response format:
        response_format:
          responseFormat?.type === 'json'
            ? {
                type: 'json_schema',
                json_schema: { schema: responseFormat.schema },
              }
            : undefined,

        // provider extensions
        ...(providerOptions?.perplexity ?? {}),

        // messages:
        messages: convertToPerplexityMessages(prompt),
      },
      warnings,
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
      url: `${this.config.baseURL}/chat/completions`,
      headers: combineHeaders(this.config.headers(), options.headers),
      body,
      failedResponseHandler: createJsonErrorResponseHandler({
        errorSchema: perplexityErrorSchema,
        errorToMessage,
      }),
      successfulResponseHandler: createJsonResponseHandler(
        perplexityResponseSchema,
      ),
      abortSignal: options.abortSignal,
      fetch: this.config.fetch,
    });

    const choice = response.choices[0];
    const content: Array<LanguageModelV2Content> = [];

    // text content:
    const text = choice.message.content;
    if (text.length > 0) {
      content.push({ type: 'text', text });
    }

    // sources:
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
      finishReason: mapPerplexityFinishReason(choice.finish_reason),
      usage: {
        inputTokens: response.usage?.prompt_tokens,
        outputTokens: response.usage?.completion_tokens,
        totalTokens: response.usage?.total_tokens ?? undefined,
      },
      request: { body },
      response: {
        ...getResponseMetadata(response),
        headers: responseHeaders,
        body: rawResponse,
      },
      warnings,
      providerMetadata: {
        perplexity: {
          images:
            response.images?.map(image => ({
              imageUrl: image.image_url,
              originUrl: image.origin_url,
              height: image.height,
              width: image.width,
            })) ?? null,
          usage: {
            citationTokens: response.usage?.citation_tokens ?? null,
            numSearchQueries: response.usage?.num_search_queries ?? null,
          },
        },
      },
    };
  }

  async doStream(
    options: Parameters<LanguageModelV2['doStream']>[0],
  ): Promise<Awaited<ReturnType<LanguageModelV2['doStream']>>> {
    const { args, warnings } = this.getArgs(options);

    const body = { ...args, stream: true };

    const { responseHeaders, value: response } = await postJsonToApi({
      url: `${this.config.baseURL}/chat/completions`,
      headers: combineHeaders(this.config.headers(), options.headers),
      body,
      failedResponseHandler: createJsonErrorResponseHandler({
        errorSchema: perplexityErrorSchema,
        errorToMessage,
      }),
      successfulResponseHandler: createEventSourceResponseHandler(
        perplexityChunkSchema,
      ),
      abortSignal: options.abortSignal,
      fetch: this.config.fetch,
    });

    let finishReason: LanguageModelV2FinishReason = 'unknown';
    const usage: LanguageModelV2Usage = {
      inputTokens: undefined,
      outputTokens: undefined,
      totalTokens: undefined,
    };

    const providerMetadata: {
      perplexity: {
        usage: {
          citationTokens: number | null;
          numSearchQueries: number | null;
        };
        images: Array<{
          imageUrl: string;
          originUrl: string;
          height: number;
          width: number;
        }> | null;
      };
    } = {
      perplexity: {
        usage: {
          citationTokens: null,
          numSearchQueries: null,
        },
        images: null,
      },
    };
    let isFirstChunk = true;
    let isActive = false;

    const self = this;

    return {
      stream: response.pipeThrough(
        new TransformStream<
          ParseResult<z.infer<typeof perplexityChunkSchema>>,
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

            if (isFirstChunk) {
              controller.enqueue({
                type: 'response-metadata',
                ...getResponseMetadata(value),
              });

              value.citations?.forEach(url => {
                controller.enqueue({
                  type: 'source',
                  sourceType: 'url',
                  id: self.config.generateId(),
                  url,
                });
              });

              isFirstChunk = false;
            }

            if (value.usage != null) {
              usage.inputTokens = value.usage.prompt_tokens;
              usage.outputTokens = value.usage.completion_tokens;

              providerMetadata.perplexity.usage = {
                citationTokens: value.usage.citation_tokens ?? null,
                numSearchQueries: value.usage.num_search_queries ?? null,
              };
            }

            if (value.images != null) {
              providerMetadata.perplexity.images = value.images.map(image => ({
                imageUrl: image.image_url,
                originUrl: image.origin_url,
                height: image.height,
                width: image.width,
              }));
            }

            const choice = value.choices[0];
            if (choice?.finish_reason != null) {
              finishReason = mapPerplexityFinishReason(choice.finish_reason);
            }

            if (choice?.delta == null) {
              return;
            }

            const delta = choice.delta;
            const textContent = delta.content;

            if (textContent != null) {
              if (!isActive) {
                controller.enqueue({ type: 'text-start', id: '0' });
                isActive = true;
              }

              controller.enqueue({
                type: 'text-delta',
                id: '0',
                delta: textContent,
              });
            }
          },

          flush(controller) {
            if (isActive) {
              controller.enqueue({ type: 'text-end', id: '0' });
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

function getResponseMetadata({
  id,
  model,
  created,
}: {
  id: string;
  created: number;
  model: string;
}) {
  return {
    id,
    modelId: model,
    timestamp: new Date(created * 1000),
  };
}

const perplexityUsageSchema = z.object({
  prompt_tokens: z.number(),
  completion_tokens: z.number(),
  total_tokens: z.number().nullish(),
  citation_tokens: z.number().nullish(),
  num_search_queries: z.number().nullish(),
});

export const perplexityImageSchema = z.object({
  image_url: z.string(),
  origin_url: z.string(),
  height: z.number(),
  width: z.number(),
});

// limited version of the schema, focussed on what is needed for the implementation
// this approach limits breakages when the API changes and increases efficiency
const perplexityResponseSchema = z.object({
  id: z.string(),
  created: z.number(),
  model: z.string(),
  choices: z.array(
    z.object({
      message: z.object({
        role: z.literal('assistant'),
        content: z.string(),
      }),
      finish_reason: z.string().nullish(),
    }),
  ),
  citations: z.array(z.string()).nullish(),
  images: z.array(perplexityImageSchema).nullish(),
  usage: perplexityUsageSchema.nullish(),
});

// limited version of the schema, focussed on what is needed for the implementation
// this approach limits breakages when the API changes and increases efficiency
const perplexityChunkSchema = z.object({
  id: z.string(),
  created: z.number(),
  model: z.string(),
  choices: z.array(
    z.object({
      delta: z.object({
        role: z.literal('assistant'),
        content: z.string(),
      }),
      finish_reason: z.string().nullish(),
    }),
  ),
  citations: z.array(z.string()).nullish(),
  images: z.array(perplexityImageSchema).nullish(),
  usage: perplexityUsageSchema.nullish(),
});

export const perplexityErrorSchema = z.object({
  error: z.object({
    code: z.number(),
    message: z.string().nullish(),
    type: z.string().nullish(),
  }),
});

export type PerplexityErrorData = z.infer<typeof perplexityErrorSchema>;

const errorToMessage = (data: PerplexityErrorData) => {
  return data.error.message ?? data.error.type ?? 'unknown error';
};
