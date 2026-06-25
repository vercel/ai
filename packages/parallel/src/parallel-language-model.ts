import {
  LanguageModelV3,
  LanguageModelV3CallWarning,
  LanguageModelV3Content,
  LanguageModelV3FinishReason,
  LanguageModelV3StreamPart,
  LanguageModelV3Usage,
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
import * as z from 'zod/v4';
import { convertToParallelMessages } from './convert-to-parallel-messages';
import { mapParallelFinishReason } from './map-parallel-finish-reason';
import { ParallelLanguageModelId } from './parallel-language-model-options';

type ParallelChatConfig = {
  baseURL: string;
  headers: () => Record<string, string | undefined>;
  generateId: () => string;
  fetch?: FetchFunction;
};

export class ParallelLanguageModel implements LanguageModelV3 {
  readonly specificationVersion = 'v3';
  readonly provider = 'parallel';

  readonly modelId: ParallelLanguageModelId;

  private readonly config: ParallelChatConfig;

  constructor(modelId: ParallelLanguageModelId, config: ParallelChatConfig) {
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
  }: Parameters<LanguageModelV3['doGenerate']>[0]) {
    const warnings: LanguageModelV3CallWarning[] = [];

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
        top_p: topP,

        // response format:
        response_format:
          responseFormat?.type === 'json'
            ? {
                type: 'json_schema',
                json_schema: responseFormat.schema,
              }
            : undefined,

        // provider extensions
        ...(providerOptions?.parallel ?? {}),

        // messages:
        messages: convertToParallelMessages(prompt),
      },
      warnings,
    };
  }

  async doGenerate(
    options: Parameters<LanguageModelV3['doGenerate']>[0],
  ): Promise<Awaited<ReturnType<LanguageModelV3['doGenerate']>>> {
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
        errorSchema: parallelErrorSchema,
        errorToMessage,
      }),
      successfulResponseHandler: createJsonResponseHandler(
        parallelResponseSchema,
      ),
      abortSignal: options.abortSignal,
      fetch: this.config.fetch,
    });

    const choice = response.choices[0];
    const content: Array<LanguageModelV3Content> = [];

    // text content:
    const text = choice.message.content;
    if (text.length > 0) {
      content.push({ type: 'text', text });
    }

    return {
      content,
      finishReason: mapParallelFinishReason(choice.finish_reason),
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
    };
  }

  async doStream(
    options: Parameters<LanguageModelV3['doStream']>[0],
  ): Promise<Awaited<ReturnType<LanguageModelV3['doStream']>>> {
    const { args, warnings } = this.getArgs(options);

    const body = { ...args, stream: true };

    const { responseHeaders, value: response } = await postJsonToApi({
      url: `${this.config.baseURL}/chat/completions`,
      headers: combineHeaders(this.config.headers(), options.headers),
      body,
      failedResponseHandler: createJsonErrorResponseHandler({
        errorSchema: parallelErrorSchema,
        errorToMessage,
      }),
      successfulResponseHandler:
        createEventSourceResponseHandler(parallelChunkSchema),
      abortSignal: options.abortSignal,
      fetch: this.config.fetch,
    });

    let finishReason: LanguageModelV3FinishReason = 'unknown';
    const usage: LanguageModelV3Usage = {
      inputTokens: undefined,
      outputTokens: undefined,
      totalTokens: undefined,
    };

    let isFirstChunk = true;
    let isActive = false;

    const self = this;

    return {
      stream: response.pipeThrough(
        new TransformStream<
          ParseResult<z.infer<typeof parallelChunkSchema>>,
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

              isFirstChunk = false;
            }

            if (value.usage != null) {
              usage.inputTokens = value.usage.prompt_tokens;
              usage.outputTokens = value.usage.completion_tokens;
            }

            const choice = value.choices[0];
            if (choice?.finish_reason != null) {
              finishReason = mapParallelFinishReason(choice.finish_reason);
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

const parallelUsageSchema = z.object({
  prompt_tokens: z.number(),
  completion_tokens: z.number(),
  total_tokens: z.number().nullish(),
});

// limited version of the schema, focussed on what is needed for the implementation
// this approach limits breakages when the API changes and increases efficiency
const parallelResponseSchema = z.object({
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
  usage: parallelUsageSchema.nullish(),
});

// limited version of the schema, focussed on what is needed for the implementation
// this approach limits breakages when the API changes and increases efficiency
const parallelChunkSchema = z.object({
  id: z.string(),
  created: z.number(),
  model: z.string(),
  choices: z.array(
    z.object({
      delta: z.object({
        role: z.literal('assistant').optional(),
        content: z.string().optional(),
      }),
      finish_reason: z.string().nullish(),
    }),
  ),
  usage: parallelUsageSchema.nullish(),
});

export const parallelErrorSchema = z.object({
  error: z.object({
    code: z.number(),
    message: z.string().nullish(),
    type: z.string().nullish(),
  }),
});

export type ParallelErrorData = z.infer<typeof parallelErrorSchema>;

const errorToMessage = (data: ParallelErrorData) => {
  return data.error.message ?? data.error.type ?? 'unknown error';
};
