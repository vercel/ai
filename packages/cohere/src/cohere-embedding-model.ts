import {
  EmbeddingModelV2,
  TooManyEmbeddingValuesForCallError,
} from '@ai-sdk/provider';
import {
  combineHeaders,
  createJsonResponseHandler,
  FetchFunction,
  parseProviderOptions,
  postJsonToApi,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';
import {
  CohereEmbeddingModelId,
  cohereEmbeddingOptions,
} from './cohere-embedding-options';
import { cohereFailedResponseHandler } from './cohere-error';

type CohereEmbeddingConfig = {
  provider: string;
  baseURL: string;
  headers: () => Record<string, string | undefined>;
  fetch?: FetchFunction;
};

export class CohereEmbeddingModel implements EmbeddingModelV2<string> {
  readonly specificationVersion = 'v2';
  readonly modelId: CohereEmbeddingModelId;

  readonly maxEmbeddingsPerCall = 96;
  readonly supportsParallelCalls = true;

  private readonly config: CohereEmbeddingConfig;

  constructor(modelId: CohereEmbeddingModelId, config: CohereEmbeddingConfig) {
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
  }: Parameters<EmbeddingModelV2<string>['doEmbed']>[0]): Promise<
    Awaited<ReturnType<EmbeddingModelV2<string>['doEmbed']>>
  > {
    const embeddingOptions = await parseProviderOptions({
      provider: 'cohere',
      providerOptions,
      schema: cohereEmbeddingOptions,
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
      url: `${this.config.baseURL}/embed`,
      headers: combineHeaders(this.config.headers(), headers),
      body: {
        model: this.modelId,
        // The AI SDK only supports 'float' embeddings which are also the only ones
        // the Cohere API docs state are supported for all models.
        // https://docs.cohere.com/v2/reference/embed#request.body.embedding_types
        embedding_types: ['float'],
        texts: values,
        input_type: embeddingOptions?.inputType ?? 'search_query',
        truncate: embeddingOptions?.truncate,
      },
      failedResponseHandler: cohereFailedResponseHandler,
      successfulResponseHandler: createJsonResponseHandler(
        cohereTextEmbeddingResponseSchema,
      ),
      abortSignal,
      fetch: this.config.fetch,
    });

    return {
      embeddings: response.embeddings.float,
      usage: { tokens: response.meta.billed_units.input_tokens },
      response: { headers: responseHeaders, body: rawValue },
    };
  }
}

// minimal version of the schema, focussed on what is needed for the implementation
// this approach limits breakages when the API changes and increases efficiency
const cohereTextEmbeddingResponseSchema = z.object({
  embeddings: z.object({
    float: z.array(z.array(z.number())),
  }),
  meta: z.object({
    billed_units: z.object({
      input_tokens: z.number(),
    }),
  }),
});
