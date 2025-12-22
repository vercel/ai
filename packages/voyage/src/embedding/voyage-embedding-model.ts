import {
  EmbeddingModelV3,
  TooManyEmbeddingValuesForCallError,
} from '@ai-sdk/provider';
import {
  combineHeaders,
  createJsonResponseHandler,
  FetchFunction,
  parseProviderOptions,
  postJsonToApi,
} from '@ai-sdk/provider-utils';
import { voyageFailedResponseHandler } from '../voyage-error';
import {
  VoyageEmbeddingInput,
  voyageEmbeddingResponseSchema,
} from './voyage-embedding-api';
import {
  VoyageEmbeddingModelId,
  voyageEmbeddingOptionsSchema,
} from './voyage-embedding-options';

type VoyageEmbeddingConfig = {
  provider: string;
  baseURL: string;
  headers: () => Record<string, string | undefined>;
  fetch?: FetchFunction;
};

export class VoyageEmbeddingModel implements EmbeddingModelV3 {
  readonly specificationVersion = 'v3';
  readonly modelId: VoyageEmbeddingModelId;

  readonly maxEmbeddingsPerCall = 128;
  readonly supportsParallelCalls = true;

  private readonly config: VoyageEmbeddingConfig;

  constructor(modelId: VoyageEmbeddingModelId, config: VoyageEmbeddingConfig) {
    this.modelId = modelId;
    this.config = config;
  }

  get provider(): string {
    return this.config.provider;
  }

  async doEmbed({
    values,
    headers,
    abortSignal,
    providerOptions,
  }: Parameters<EmbeddingModelV3['doEmbed']>[0]): Promise<
    Awaited<ReturnType<EmbeddingModelV3['doEmbed']>>
  > {
    const embeddingOptions = await parseProviderOptions({
      provider: 'voyage',
      providerOptions,
      schema: voyageEmbeddingOptionsSchema,
    });

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
      url: `${this.config.baseURL}/embeddings`,
      headers: combineHeaders(this.config.headers(), headers),
      body: {
        model: this.modelId,
        input: values,
        input_type: embeddingOptions?.inputType,
        truncation: embeddingOptions?.truncation,
        output_dimension: embeddingOptions?.outputDimension,
        output_dtype: embeddingOptions?.outputDtype,
      } satisfies VoyageEmbeddingInput,
      failedResponseHandler: voyageFailedResponseHandler,
      successfulResponseHandler: createJsonResponseHandler(
        voyageEmbeddingResponseSchema,
      ),
      abortSignal,
      fetch: this.config.fetch,
    });

    // Sort embeddings by index to ensure correct order
    const sortedEmbeddings = response.data
      .sort((a, b) => a.index - b.index)
      .map(item => item.embedding);

    return {
      warnings: [],
      embeddings: sortedEmbeddings,
      usage: { tokens: response.usage.total_tokens },
      response: { headers: responseHeaders, body: rawValue },
    };
  }
}
