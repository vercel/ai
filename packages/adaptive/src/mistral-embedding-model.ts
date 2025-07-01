import {
  EmbeddingModelV2,
  TooManyEmbeddingValuesForCallError,
} from '@ai-sdk/provider';
import {
  combineHeaders,
  createJsonResponseHandler,
  FetchFunction,
  postJsonToApi,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';
import { MistralEmbeddingModelId } from './mistral-embedding-options';
import { mistralFailedResponseHandler } from './mistral-error';

type MistralEmbeddingConfig = {
  provider: string;
  baseURL: string;
  headers: () => Record<string, string | undefined>;
  fetch?: FetchFunction;
};

export class MistralEmbeddingModel implements EmbeddingModelV2<string> {
  readonly specificationVersion = 'v2';
  readonly modelId: MistralEmbeddingModelId;
  readonly maxEmbeddingsPerCall = 32;
  readonly supportsParallelCalls = false;

  private readonly config: MistralEmbeddingConfig;

  get provider(): string {
    return this.config.provider;
  }

  constructor(
    modelId: MistralEmbeddingModelId,
    config: MistralEmbeddingConfig,
  ) {
    this.modelId = modelId;
    this.config = config;
  }

  async doEmbed({
    values,
    abortSignal,
    headers,
  }: Parameters<EmbeddingModelV2<string>['doEmbed']>[0]): Promise<
    Awaited<ReturnType<EmbeddingModelV2<string>['doEmbed']>>
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
      url: `${this.config.baseURL}/embeddings`,
      headers: combineHeaders(this.config.headers(), headers),
      body: {
        model: this.modelId,
        input: values,
        encoding_format: 'float',
      },
      failedResponseHandler: mistralFailedResponseHandler,
      successfulResponseHandler: createJsonResponseHandler(
        MistralTextEmbeddingResponseSchema,
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
const MistralTextEmbeddingResponseSchema = z.object({
  data: z.array(z.object({ embedding: z.array(z.number()) })),
  usage: z.object({ prompt_tokens: z.number() }).nullish(),
});
