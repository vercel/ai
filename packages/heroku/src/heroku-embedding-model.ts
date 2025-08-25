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
  HerokuEmbeddingModelId,
  herokuEmbeddingOptions,
} from './heroku-embedding-options';
import { herokuFailedResponseHandler } from './heroku-error';

type HerokuEmbeddingConfig = {
  provider: string;
  baseURL: string;
  headers: Record<string, string | undefined>;
  fetch?: FetchFunction;
};

export class HerokuEmbeddingModel implements EmbeddingModelV2<string> {
  readonly specificationVersion = 'v2';
  readonly modelId: HerokuEmbeddingModelId;

  readonly maxEmbeddingsPerCall = 96;
  readonly supportsParallelCalls = true;

  private readonly config: HerokuEmbeddingConfig;

  constructor(modelId: HerokuEmbeddingModelId, config: HerokuEmbeddingConfig) {
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
      provider: 'heroku',
      providerOptions,
      schema: herokuEmbeddingOptions,
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
      url: `${this.config.baseURL}/v1/embeddings`,
      headers: combineHeaders(this.config.headers, headers),
      body: {
        model: this.modelId,
        input: values,
        input_type: embeddingOptions?.inputType,
        encoding_format: embeddingOptions?.encodingFormat,
        embedding_type: embeddingOptions?.embeddingType,
        allow_ignored_params: embeddingOptions?.allowIgnoredParams,
      },
      failedResponseHandler: herokuFailedResponseHandler,
      successfulResponseHandler: createJsonResponseHandler(
        herokuTextEmbeddingResponseSchema,
      ),
      abortSignal,
      fetch: this.config.fetch,
    });

    return {
      embeddings: response.data.map(item => item.embedding),
      usage: response.usage
        ? { tokens: response.usage.prompt_tokens }
        : undefined,
      response: { headers: responseHeaders, body: rawValue },
    };
  }
}

// minimal version of the schema, focussed on what is needed for the implementation
// this approach limits breakages when the API changes and increases efficiency
const herokuTextEmbeddingResponseSchema = z.object({
  data: z.array(
    z.object({
      embedding: z.array(z.number()),
      index: z.number(),
    }),
  ),
  usage: z
    .object({
      prompt_tokens: z.number(),
      total_tokens: z.number(),
    })
    .optional(),
});
