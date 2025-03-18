import {
  LanguageModelV1,
  LanguageModelV1CallWarning,
  LanguageModelV1FinishReason,
  LanguageModelV1StreamPart,
  UnsupportedFunctionalityError,
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
import { z } from 'zod';
import { PerplexityLanguageModelId } from './perplexity-language-model-settings';
import { convertToPerplexityMessages } from './convert-to-perplexity-messages';
import { mapPerplexityFinishReason } from './map-perplexity-finish-reason';

type PerplexityChatConfig = {
  baseURL: string;
  headers: () => Record<string, string | undefined>;
  generateId: () => string;
  fetch?: FetchFunction;
};

export class PerplexityLanguageModel implements LanguageModelV1 {
  readonly specificationVersion = 'v1';
  readonly defaultObjectGenerationMode = 'json';
  readonly supportsStructuredOutputs = true;
  readonly supportsImageUrls = false;
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

  private getArgs({
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
    providerMetadata,
  }: Parameters<LanguageModelV1['doGenerate']>[0]) {
    const type = mode.type;

    const warnings: LanguageModelV1CallWarning[] = [];

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

    const baseArgs = {
      // model id:
      model: this.modelId,

      // standardized settings:
      frequency_penalty: frequencyPenalty,
      max_tokens: maxTokens,
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
      ...(providerMetadata?.perplexity ?? {}),

      // messages:
      messages: convertToPerplexityMessages(prompt),
    };

    switch (type) {
      case 'regular': {
        return { args: baseArgs, warnings };
      }

      case 'object-json': {
        return {
          args: {
            ...baseArgs,
            response_format: {
              type: 'json_schema',
              json_schema: { schema: mode.schema },
            },
          },
          warnings,
        };
      }

      case 'object-tool': {
        throw new UnsupportedFunctionalityError({
          functionality: 'tool-mode object generation',
        });
      }

      default: {
        const _exhaustiveCheck: never = type;
        throw new Error(`Unsupported type: ${_exhaustiveCheck}`);
      }
    }
  }

  async doGenerate(
    options: Parameters<LanguageModelV1['doGenerate']>[0],
  ): Promise<Awaited<ReturnType<LanguageModelV1['doGenerate']>>> {
    const { args, warnings } = this.getArgs(options);

    const {
      responseHeaders,
      value: response,
      rawValue: rawResponse,
    } = await postJsonToApi({
      url: `${this.config.baseURL}/chat/completions`,
      headers: combineHeaders(this.config.headers(), options.headers),
      body: args,
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

    const { messages: rawPrompt, ...rawSettings } = args;
    const choice = response.choices[0];
    const text = choice.message.content;

    return {
      text,
      toolCalls: [],
      finishReason: mapPerplexityFinishReason(choice.finish_reason),
      usage: {
        promptTokens: response.usage?.prompt_tokens ?? Number.NaN,
        completionTokens: response.usage?.completion_tokens ?? Number.NaN,
      },
      rawCall: { rawPrompt, rawSettings },
      rawResponse: { headers: responseHeaders, body: rawResponse },
      request: { body: JSON.stringify(args) },
      response: getResponseMetadata(response),
      warnings,
      sources: response.citations?.map(url => ({
        sourceType: 'url',
        id: this.config.generateId(),
        url,
      })),
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
    options: Parameters<LanguageModelV1['doStream']>[0],
  ): Promise<Awaited<ReturnType<LanguageModelV1['doStream']>>> {
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

    const { messages: rawPrompt, ...rawSettings } = args;

    let finishReason: LanguageModelV1FinishReason = 'unknown';
    let usage: { promptTokens: number; completionTokens: number } = {
      promptTokens: Number.NaN,
      completionTokens: Number.NaN,
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

    const self = this;

    return {
      stream: response.pipeThrough(
        new TransformStream<
          ParseResult<z.infer<typeof perplexityChunkSchema>>,
          LanguageModelV1StreamPart
        >({
          transform(chunk, controller) {
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
                  source: {
                    sourceType: 'url',
                    id: self.config.generateId(),
                    url,
                  },
                });
              });

              isFirstChunk = false;
            }

            if (value.usage != null) {
              usage = {
                promptTokens: value.usage.prompt_tokens,
                completionTokens: value.usage.completion_tokens,
              };

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
              controller.enqueue({
                type: 'text-delta',
                textDelta: textContent,
              });
            }
          },

          flush(controller) {
            controller.enqueue({
              type: 'finish',
              finishReason,
              usage,
              providerMetadata,
            });
          },
        }),
      ),
      rawCall: { rawPrompt, rawSettings },
      rawResponse: { headers: responseHeaders },
      request: { body: JSON.stringify(body) },
      warnings,
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
