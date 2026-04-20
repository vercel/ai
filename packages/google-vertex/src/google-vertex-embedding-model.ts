import {
  type EmbeddingModelV4,
  TooManyEmbeddingValuesForCallError,
} from '@ai-sdk/provider';
import {
  combineHeaders,
  createJsonResponseHandler,
  postJsonToApi,
  resolve,
  parseProviderOptions,
  serializeModelOptions,
  WORKFLOW_SERIALIZE,
  WORKFLOW_DESERIALIZE,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';
import { googleVertexFailedResponseHandler } from './google-vertex-error';
import {
  GoogleVertexEmbeddingModelId,
  googleVertexEmbeddingModelOptions,
} from './google-vertex-embedding-options';
import { GoogleVertexConfig } from './google-vertex-config';

export class GoogleVertexEmbeddingModel implements EmbeddingModelV4 {
  readonly specificationVersion = 'v4';
  readonly modelId: GoogleVertexEmbeddingModelId;
  readonly maxEmbeddingsPerCall = 2048;
  readonly supportsParallelCalls = true;

  private readonly config: GoogleVertexConfig;

  static [WORKFLOW_SERIALIZE](model: GoogleVertexEmbeddingModel) {
    return serializeModelOptions({
      modelId: model.modelId,
      config: model.config,
    });
  }

  static [WORKFLOW_DESERIALIZE](options: {
    modelId: string;
    config: GoogleVertexConfig;
  }) {
    return new GoogleVertexEmbeddingModel(options.modelId, options.config);
  }

  get provider(): string {
    return this.config.provider;
  }

  constructor(
    modelId: GoogleVertexEmbeddingModelId,
    config: GoogleVertexConfig,
  ) {
    this.modelId = modelId;
    this.config = config;
  }

  async doEmbed({
    values,
    headers,
    abortSignal,
    providerOptions,
  }: Parameters<EmbeddingModelV4['doEmbed']>[0]): Promise<
    Awaited<ReturnType<EmbeddingModelV4['doEmbed']>>
  > {
    let googleOptions = await parseProviderOptions({
      provider: 'vertex',
      providerOptions,
      schema: googleVertexEmbeddingModelOptions,
    });

    if (googleOptions == null) {
      googleOptions = await parseProviderOptions({
        provider: 'google',
        providerOptions,
        schema: googleVertexEmbeddingModelOptions,
      });
    }

    googleOptions = googleOptions ?? {};

    if (values.length > this.maxEmbeddingsPerCall) {
      throw new TooManyEmbeddingValuesForCallError({
        provider: this.provider,
        modelId: this.modelId,
        maxEmbeddingsPerCall: this.maxEmbeddingsPerCall,
        values,
      });
    }

    const mergedHeaders = combineHeaders(
      this.config.headers ? await resolve(this.config.headers) : undefined,
      headers,
    );

    const url = `${this.config.baseURL}/models/${this.modelId}:predict`;
    const {
      responseHeaders,
      value: response,
      rawValue,
    } = await postJsonToApi({
      url,
      headers: mergedHeaders,
      body: {
        instances: values.map(value => ({
          content: value,
          task_type: googleOptions.taskType,
          title: googleOptions.title,
        })),
        parameters: {
          outputDimensionality: googleOptions.outputDimensionality,
          autoTruncate: googleOptions.autoTruncate,
        },
      },
      failedResponseHandler: googleVertexFailedResponseHandler,
      successfulResponseHandler: createJsonResponseHandler(
        googleVertexTextEmbeddingResponseSchema,
      ),
      abortSignal,
      fetch: this.config.fetch,
    });

    return {
      warnings: [],
      embeddings: response.predictions.map(
        prediction => prediction.embeddings.values,
      ),
      usage: {
        tokens: response.predictions.reduce(
          (tokenCount, prediction) =>
            tokenCount + prediction.embeddings.statistics.token_count,
          0,
        ),
      },
      response: { headers: responseHeaders, body: rawValue },
    };
  }
}

// minimal version of the schema, focussed on what is needed for the implementation
// this approach limits breakages when the API changes and increases efficiency
const googleVertexTextEmbeddingResponseSchema = z.object({
  predictions: z.array(
    z.object({
      embeddings: z.object({
        values: z.array(z.number()),
        statistics: z.object({
          token_count: z.number(),
        }),
      }),
    }),
  ),
});
