import {
  EmbeddingModelV2,
  TooManyEmbeddingValuesForCallError,
} from '@ai-sdk/provider';
import {
  combineHeaders,
  createJsonResponseHandler,
  postJsonToApi,
  resolve,
  Resolvable,
  parseProviderOptions,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';
import { googleVertexFailedResponseHandler } from './google-vertex-error';
import {
  GoogleVertexEmbeddingModelId,
  googleVertexEmbeddingProviderOptions,
} from './google-vertex-embedding-options';
import { GoogleVertexConfig } from './google-vertex-config';

export class GoogleVertexEmbeddingModel implements EmbeddingModelV2<string> {
  readonly specificationVersion = 'v2';
  readonly modelId: GoogleVertexEmbeddingModelId;
  readonly maxEmbeddingsPerCall = 2048;
  readonly supportsParallelCalls = true;

  private readonly config: GoogleVertexConfig;

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
  }: Parameters<EmbeddingModelV2<string>['doEmbed']>[0]): Promise<
    Awaited<ReturnType<EmbeddingModelV2<string>['doEmbed']>>
  > {
    // Parse provider options
    const googleOptions =
      (await parseProviderOptions({
        provider: 'google',
        providerOptions,
        schema: googleVertexEmbeddingProviderOptions,
      })) ?? {};

    if (values.length > this.maxEmbeddingsPerCall) {
      throw new TooManyEmbeddingValuesForCallError({
        provider: this.provider,
        modelId: this.modelId,
        maxEmbeddingsPerCall: this.maxEmbeddingsPerCall,
        values,
      });
    }

    const mergedHeaders = combineHeaders(
      await resolve(this.config.headers),
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
        instances: values.map(value => ({ content: value })),
        parameters: {
          outputDimensionality: googleOptions.outputDimensionality,
          taskType: googleOptions.taskType,
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
