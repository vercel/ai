import {
  EmbeddingModelV1,
  TooManyEmbeddingValuesForCallError,
} from '@ai-sdk/provider';
import {
  combineHeaders,
  createJsonErrorResponseHandler,
  createJsonResponseHandler,
  FetchFunction,
  postJsonToApi,
} from '@ai-sdk/provider-utils';
import { z } from 'zod';
import {
  OpenAICompatibleEmbeddingModelId,
  OpenAICompatibleEmbeddingSettings,
} from './openai-compatible-embedding-settings';
import {
  defaultOpenAICompatibleErrorStructure,
  ProviderErrorStructure,
} from './openai-compatible-error';

type OpenAICompatibleEmbeddingConfig = {
  /**
Override the maximum number of embeddings per call.
   */
  maxEmbeddingsPerCall?: number;

  /**
Override the parallelism of embedding calls.
  */
  supportsParallelCalls?: boolean;

  provider: string;
  url: (options: { modelId: string; path: string }) => string;
  headers: () => Record<string, string | undefined>;
  fetch?: FetchFunction;
  errorStructure?: ProviderErrorStructure<any>;
};

export class OpenAICompatibleEmbeddingModel
  implements EmbeddingModelV1<string>
{
  readonly specificationVersion = 'v1';
  readonly modelId: OpenAICompatibleEmbeddingModelId;

  private readonly config: OpenAICompatibleEmbeddingConfig;
  private readonly settings: OpenAICompatibleEmbeddingSettings;

  get provider(): string {
    return this.config.provider;
  }

  get maxEmbeddingsPerCall(): number {
    return this.config.maxEmbeddingsPerCall ?? 2048;
  }

  get supportsParallelCalls(): boolean {
    return this.config.supportsParallelCalls ?? true;
  }

  constructor(
    modelId: OpenAICompatibleEmbeddingModelId,
    settings: OpenAICompatibleEmbeddingSettings,
    config: OpenAICompatibleEmbeddingConfig,
  ) {
    this.modelId = modelId;
    this.settings = settings;
    this.config = config;
  }

  async doEmbed({
    values,
    headers,
    abortSignal,
  }: Parameters<EmbeddingModelV1<string>['doEmbed']>[0]): Promise<
    Awaited<ReturnType<EmbeddingModelV1<string>['doEmbed']>>
  > {
    if (values.length > this.maxEmbeddingsPerCall) {
      throw new TooManyEmbeddingValuesForCallError({
        provider: this.provider,
        modelId: this.modelId,
        maxEmbeddingsPerCall: this.maxEmbeddingsPerCall,
        values,
      });
    }

    const { responseHeaders, value: response } = await postJsonToApi({
      url: this.config.url({
        path: '/embeddings',
        modelId: this.modelId,
      }),
      headers: combineHeaders(this.config.headers(), headers),
      body: {
        model: this.modelId,
        input: values,
        encoding_format: 'float',
        dimensions: this.settings.dimensions,
        user: this.settings.user,
      },
      failedResponseHandler: createJsonErrorResponseHandler(
        this.config.errorStructure ?? defaultOpenAICompatibleErrorStructure,
      ),
      successfulResponseHandler: createJsonResponseHandler(
        openaiTextEmbeddingResponseSchema,
      ),
      abortSignal,
      fetch: this.config.fetch,
    });

    return {
      embeddings: response.data.map(item => item.embedding),
      usage: response.usage
        ? { tokens: response.usage.prompt_tokens }
        : undefined,
      rawResponse: { headers: responseHeaders },
    };
  }
}

// minimal version of the schema, focussed on what is needed for the implementation
// this approach limits breakages when the API changes and increases efficiency
const openaiTextEmbeddingResponseSchema = z.object({
  data: z.array(z.object({ embedding: z.array(z.number()) })),
  usage: z.object({ prompt_tokens: z.number() }).nullish(),
});
