import {
  EmbeddingModelV4,
  TooManyEmbeddingValuesForCallError,
} from '@ai-sdk/provider';
import {
  combineHeaders,
  createJsonResponseHandler,
  FetchFunction,
  postJsonToApi,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';
import {
  ZeroEntropyEmbeddingModelId,
  ZeroEntropyEmbeddingModelOptions,
} from './zeroentropy-embedding-options';
import { zeroEntropyFailedResponseHandler } from './zeroentropy-error';

type ZeroEntropyEmbeddingConfig = {
  provider: string;
  baseURL: string;
  headers: () => Record<string, string | undefined>;
  fetch?: FetchFunction;
};

export class ZeroEntropyEmbeddingModel implements EmbeddingModelV4 {
  readonly specificationVersion = 'v4';
  readonly modelId: ZeroEntropyEmbeddingModelId;
  // ZeroEntropy rate limit: 5,000,000 bytes max payload; use 512 as safe default
  readonly maxEmbeddingsPerCall = 512;
  readonly supportsParallelCalls = true;

  private readonly config: ZeroEntropyEmbeddingConfig;
  private readonly options: ZeroEntropyEmbeddingModelOptions;

  get provider(): string {
    return this.config.provider;
  }

  constructor(
    modelId: ZeroEntropyEmbeddingModelId,
    options: ZeroEntropyEmbeddingModelOptions,
    config: ZeroEntropyEmbeddingConfig,
  ) {
    this.modelId = modelId;
    this.options = options;
    this.config = config;
  }

  async doEmbed({
    values,
    abortSignal,
    headers,
  }: Parameters<EmbeddingModelV4['doEmbed']>[0]): Promise<
    Awaited<ReturnType<EmbeddingModelV4['doEmbed']>>
  > {
    if (values.length > this.maxEmbeddingsPerCall) {
      throw new TooManyEmbeddingValuesForCallError({
        provider: this.provider,
        modelId: this.modelId,
        maxEmbeddingsPerCall: this.maxEmbeddingsPerCall,
        values,
      });
    }

    const {
      responseHeaders,
      value: response,
      rawValue,
    } = await postJsonToApi({
      url: `${this.config.baseURL}/models/embed`,
      headers: combineHeaders(this.config.headers(), headers),
      body: {
        model: this.modelId,
        input: values,
        input_type: this.options.inputType ?? 'query',
        encoding_format: 'float',
        ...(this.options.dimensions != null && {
          dimensions: this.options.dimensions,
        }),
        ...(this.options.latency != null && {
          latency: this.options.latency,
        }),
      },
      failedResponseHandler: zeroEntropyFailedResponseHandler,
      successfulResponseHandler: createJsonResponseHandler(
        ZeroEntropyTextEmbeddingResponseSchema,
      ),
      abortSignal,
      fetch: this.config.fetch,
    });

    return {
      warnings: [],
      embeddings: response.results.map(item => item.embedding),
      usage: response.usage
        ? { tokens: response.usage.total_tokens }
        : undefined,
      response: { headers: responseHeaders, body: rawValue },
    };
  }
}

// minimal version of the schema, focused on what is needed for the implementation
const ZeroEntropyTextEmbeddingResponseSchema = z.object({
  results: z.array(z.object({ embedding: z.array(z.number()) })),
  usage: z
    .object({
      total_bytes: z.number(),
      total_tokens: z.number(),
    })
    .nullish(),
});
