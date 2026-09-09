import {
  TooManyEmbeddingValuesForCallError,
  type EmbeddingModelV4,
} from '@ai-sdk/provider';
import {
  combineHeaders,
  convertBase64ToUint8Array,
  createJsonErrorResponseHandler,
  createJsonResponseHandler,
  parseProviderOptions,
  postJsonToApi,
  serializeModelOptions,
  WORKFLOW_DESERIALIZE,
  WORKFLOW_SERIALIZE,
  type FetchFunction,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';
import {
  perplexityEmbeddingModelOptions,
  type PerplexityEmbeddingModelId,
} from './perplexity-embedding-model-options';
import { perplexityErrorSchema } from './perplexity-language-model';

type PerplexityEmbeddingConfig = {
  provider: string;
  baseURL: string;
  headers: () => Record<string, string | undefined>;
  fetch?: FetchFunction;
};

export class PerplexityEmbeddingModel implements EmbeddingModelV4 {
  readonly specificationVersion = 'v4';
  readonly modelId: PerplexityEmbeddingModelId;
  // https://docs.perplexity.ai/docs/embeddings/standard-embeddings
  readonly maxEmbeddingsPerCall = 512;
  readonly supportsParallelCalls = true;

  private readonly config: PerplexityEmbeddingConfig;

  get provider(): string {
    return this.config.provider;
  }

  static [WORKFLOW_SERIALIZE](model: PerplexityEmbeddingModel) {
    return serializeModelOptions({
      modelId: model.modelId,
      config: model.config,
    });
  }

  static [WORKFLOW_DESERIALIZE](options: {
    modelId: PerplexityEmbeddingModelId;
    config: PerplexityEmbeddingConfig;
  }) {
    return new PerplexityEmbeddingModel(options.modelId, options.config);
  }

  constructor(
    modelId: PerplexityEmbeddingModelId,
    config: PerplexityEmbeddingConfig,
  ) {
    this.modelId = modelId;
    this.config = config;
  }

  async doEmbed({
    values,
    abortSignal,
    headers,
    providerOptions,
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

    const perplexityOptions =
      (await parseProviderOptions({
        provider: 'perplexity',
        providerOptions,
        schema: perplexityEmbeddingModelOptions,
      })) ?? {};

    // Perplexity only returns quantized (base64-encoded) embeddings.
    const encodingFormat = perplexityOptions.encodingFormat ?? 'base64_int8';

    const {
      responseHeaders,
      value: response,
      rawValue,
    } = await postJsonToApi({
      url: `${this.config.baseURL}/v1/embeddings`,
      headers: combineHeaders(this.config.headers(), headers),
      body: {
        model: this.modelId,
        input: values,
        dimensions: perplexityOptions.dimensions,
        encoding_format: encodingFormat,
      },
      failedResponseHandler: createJsonErrorResponseHandler({
        errorSchema: perplexityErrorSchema,
        errorToMessage: data => data.error.message ?? 'Unknown error',
      }),
      successfulResponseHandler: createJsonResponseHandler(
        perplexityEmbeddingResponseSchema,
      ),
      abortSignal,
      fetch: this.config.fetch,
    });

    const cost = response.usage?.cost;

    return {
      embeddings: response.data.map(item =>
        decodeEmbedding(item.embedding, encodingFormat),
      ),
      usage: response.usage
        ? { tokens: response.usage.prompt_tokens }
        : undefined,
      providerMetadata: cost
        ? {
            perplexity: {
              cost: {
                inputCost: cost.input_cost ?? null,
                totalCost: cost.total_cost ?? null,
                currency: cost.currency ?? null,
              },
            },
          }
        : undefined,
      response: { headers: responseHeaders, body: rawValue },
      warnings: [],
    };
  }
}

/**
 * Decodes a base64-encoded Perplexity embedding into a numeric vector.
 * For `base64_int8` the bytes are reinterpreted as signed int8 values;
 * for `base64_binary` the raw unsigned bytes (packed bits) are returned.
 */
function decodeEmbedding(
  base64: string,
  encodingFormat: 'base64_int8' | 'base64_binary',
): number[] {
  const bytes = convertBase64ToUint8Array(base64);

  if (encodingFormat === 'base64_int8') {
    const int8 = new Int8Array(
      bytes.buffer,
      bytes.byteOffset,
      bytes.byteLength,
    );
    return Array.from(int8);
  }

  return Array.from(bytes);
}

// minimal version of the schema, focussed on what is needed for the implementation
// this approach limits breakages when the API changes and increases efficiency
const perplexityEmbeddingResponseSchema = z.object({
  data: z.array(z.object({ embedding: z.string() })),
  usage: z
    .object({
      prompt_tokens: z.number(),
      cost: z
        .object({
          input_cost: z.number().nullish(),
          total_cost: z.number().nullish(),
          currency: z.string().nullish(),
        })
        .nullish(),
    })
    .nullish(),
});
