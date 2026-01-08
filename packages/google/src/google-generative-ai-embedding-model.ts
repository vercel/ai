import {
  EmbeddingModelV3,
  TooManyEmbeddingValuesForCallError,
} from '@ai-sdk/provider';
import {
  combineHeaders,
  createJsonResponseHandler,
  FetchFunction,
  lazySchema,
  parseProviderOptions,
  postJsonToApi,
  resolve,
  zodSchema,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';
import { googleFailedResponseHandler } from './google-error';
import {
  GoogleGenerativeAIEmbeddingModelId,
  googleGenerativeAIEmbeddingProviderOptions,
} from './google-generative-ai-embedding-options';

type GoogleGenerativeAIEmbeddingConfig = {
  provider: string;
  baseURL: string;
  headers: () => Record<string, string | undefined>;
  fetch?: FetchFunction;
};

export class GoogleGenerativeAIEmbeddingModel implements EmbeddingModelV3 {
  readonly specificationVersion = 'v3';
  readonly modelId: GoogleGenerativeAIEmbeddingModelId;
  readonly maxEmbeddingsPerCall = 2048;
  readonly supportsParallelCalls = true;

  private readonly config: GoogleGenerativeAIEmbeddingConfig;

  get provider(): string {
    return this.config.provider;
  }
  constructor(
    modelId: GoogleGenerativeAIEmbeddingModelId,
    config: GoogleGenerativeAIEmbeddingConfig,
  ) {
    this.modelId = modelId;
    this.config = config;
  }

  async doEmbed({
    values,
    headers,
    abortSignal,
    providerOptions,
  }: Parameters<EmbeddingModelV3['doEmbed']>[0]): Promise<
    Awaited<ReturnType<EmbeddingModelV3['doEmbed']>>
  > {
    // Parse provider options
    const googleOptions = await parseProviderOptions({
      provider: 'google',
      providerOptions,
      schema: googleGenerativeAIEmbeddingProviderOptions,
    });

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

    // For single embeddings, use the single endpoint (ratelimits, etc.)
    if (values.length === 1) {
      const {
        responseHeaders,
        value: response,
        rawValue,
      } = await postJsonToApi({
        url: `${this.config.baseURL}/models/${this.modelId}:embedContent`,
        headers: mergedHeaders,
        body: {
          model: `models/${this.modelId}`,
          content: {
            parts: [{ text: values[0] }],
          },
          outputDimensionality: googleOptions?.outputDimensionality,
          taskType: googleOptions?.taskType,
        },
        failedResponseHandler: googleFailedResponseHandler,
        successfulResponseHandler: createJsonResponseHandler(
          googleGenerativeAISingleEmbeddingResponseSchema,
        ),
        abortSignal,
        fetch: this.config.fetch,
      });

      return {
        warnings: [],
        embeddings: [response.embedding.values],
        usage: undefined,
        response: { headers: responseHeaders, body: rawValue },
      };
    }

    const {
      responseHeaders,
      value: response,
      rawValue,
    } = await postJsonToApi({
      url: `${this.config.baseURL}/models/${this.modelId}:batchEmbedContents`,
      headers: mergedHeaders,
      body: {
        requests: values.map(value => ({
          model: `models/${this.modelId}`,
          content: { role: 'user', parts: [{ text: value }] },
          outputDimensionality: googleOptions?.outputDimensionality,
          taskType: googleOptions?.taskType,
        })),
      },
      failedResponseHandler: googleFailedResponseHandler,
      successfulResponseHandler: createJsonResponseHandler(
        googleGenerativeAITextEmbeddingResponseSchema,
      ),
      abortSignal,
      fetch: this.config.fetch,
    });

    return {
      warnings: [],
      embeddings: response.embeddings.map(item => item.values),
      usage: undefined,
      response: { headers: responseHeaders, body: rawValue },
    };
  }
}

// minimal version of the schema, focussed on what is needed for the implementation
// this approach limits breakages when the API changes and increases efficiency
const googleGenerativeAITextEmbeddingResponseSchema = lazySchema(() =>
  zodSchema(
    z.object({
      embeddings: z.array(z.object({ values: z.array(z.number()) })),
    }),
  ),
);

// Schema for single embedding response
const googleGenerativeAISingleEmbeddingResponseSchema = lazySchema(() =>
  zodSchema(
    z.object({
      embedding: z.object({ values: z.array(z.number()) }),
    }),
  ),
);
