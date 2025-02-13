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
      // TODO

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

    const { responseHeaders, value: response } = await postJsonToApi({
      url: `${this.config.baseURL}/chat/completions`,
      headers: combineHeaders(this.config.headers(), options.headers),
      body: args,
      failedResponseHandler: createJsonErrorResponseHandler({
        errorSchema: perplexityErrorSchema,
        errorToMessage: data => data.error,
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
        promptTokens: response.usage.prompt_tokens,
        completionTokens: response.usage.completion_tokens,
      },
      rawCall: { rawPrompt, rawSettings },
      rawResponse: { headers: responseHeaders },
      request: { body: JSON.stringify(args) },
      response: getResponseMetadata(response),
      warnings,
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
        errorToMessage: data => data.error,
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
    let isFirstChunk = true;

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

              // TODO sources

              isFirstChunk = false;
            }

            if (value.usage != null) {
              usage = {
                promptTokens: value.usage.prompt_tokens,
                completionTokens: value.usage.completion_tokens,
              };
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
            controller.enqueue({ type: 'finish', finishReason, usage });
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
      finish_reason: z.string(),
    }),
  ),
  citations: z.array(z.string()),
  usage: z.object({
    prompt_tokens: z.number(),
    completion_tokens: z.number(),
  }),
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
  usage: z
    .object({
      prompt_tokens: z.number(),
      completion_tokens: z.number(),
    })
    .nullish(),
});

export const perplexityErrorSchema = z.object({
  code: z.string(),
  error: z.string(),
});

export type PerplexityErrorData = z.infer<typeof perplexityErrorSchema>;
