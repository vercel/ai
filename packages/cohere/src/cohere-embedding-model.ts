import {
  TooManyEmbeddingValuesForCallError,
  type EmbeddingModelV4,
  type SharedV4ProviderOptions,
  type JSONValue,
} from '@ai-sdk/provider';
import {
  combineHeaders,
  createJsonResponseHandler,
  parseProviderOptions,
  postJsonToApi,
  serializeModelOptions,
  WORKFLOW_SERIALIZE,
  WORKFLOW_DESERIALIZE,
  type FetchFunction,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';
import {
  cohereEmbeddingModelOptions,
  type CohereEmbeddingModelId,
  type CohereEmbeddingModelOptions,
} from './cohere-embedding-model-options';
import { cohereFailedResponseHandler } from './cohere-error';

type CohereEmbeddingConfig = {
  provider: string;
  baseURL: string;
  headers?: () => Record<string, string | undefined>;
  fetch?: FetchFunction;
};

export type CohereEmbeddingModelV4ProviderOptions = {
  cohere?: CohereEmbeddingModelOptions & Record<string, JSONValue>;
} & SharedV4ProviderOptions;

export class CohereEmbeddingModel implements EmbeddingModelV4<CohereEmbeddingModelV4ProviderOptions> {
  readonly specificationVersion = 'v4';
  readonly modelId: CohereEmbeddingModelId;

  readonly maxEmbeddingsPerCall = 96;
  readonly supportsParallelCalls = true;

  private readonly config: CohereEmbeddingConfig;

  static [WORKFLOW_SERIALIZE](model: CohereEmbeddingModel) {
    return serializeModelOptions({
      modelId: model.modelId,
      config: model.config,
    });
  }

  static [WORKFLOW_DESERIALIZE](options: {
    modelId: CohereEmbeddingModelId;
    config: CohereEmbeddingConfig;
  }) {
    return new CohereEmbeddingModel(options.modelId, options.config);
  }

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
  }: Parameters<
    EmbeddingModelV4<CohereEmbeddingModelV4ProviderOptions>['doEmbed']
  >[0]): Promise<
    Awaited<
      ReturnType<
        EmbeddingModelV4<CohereEmbeddingModelV4ProviderOptions>['doEmbed']
      >
    >
  > {
    const embeddingOptions = await parseProviderOptions({
      provider: 'cohere',
      providerOptions,
      schema: cohereEmbeddingModelOptions,
    });
    const embeddingType = embeddingOptions?.embeddingType ?? 'float';

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
      headers: combineHeaders(this.config.headers?.(), headers),
      body: {
        model: this.modelId,
        embedding_types: [embeddingType],
        texts: values,
        input_type: embeddingOptions?.inputType ?? 'search_query',
        truncate: embeddingOptions?.truncate,
        output_dimension: embeddingOptions?.outputDimension,
      },
      failedResponseHandler: cohereFailedResponseHandler,
      successfulResponseHandler: createJsonResponseHandler(
        cohereTextEmbeddingResponseSchema(embeddingType),
      ),
      abortSignal,
      fetch: this.config.fetch,
    });

    return {
      warnings: [],
      embeddings: response.embeddings[embeddingType],
      usage: { tokens: response.meta.billed_units.input_tokens },
      response: { headers: responseHeaders, body: rawValue },
    };
  }
}

// minimal version of the schema, focussed on what is needed for the implementation
// this approach limits breakages when the API changes and increases efficiency
const cohereTextEmbeddingResponseSchema = (
  embeddingType: NonNullable<CohereEmbeddingModelOptions['embeddingType']>,
) =>
  z.object({
    embeddings: z.object({
      [embeddingType]: z.array(z.array(z.number())),
    }),
    meta: z.object({
      billed_units: z.object({
        input_tokens: z.number(),
      }),
    }),
  });
