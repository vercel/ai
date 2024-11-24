import {
  EmbeddingModelV1,
  TooManyEmbeddingValuesForCallError,
} from '@ai-sdk/provider';
import {
  combineHeaders,
  createJsonResponseHandler,
  FetchFunction,
  postJsonToApi,
} from '@ai-sdk/provider-utils';
import { z } from 'zod';
import { googleFailedResponseHandler } from './google-error';
import {
  GoogleGenerativeAIEmbeddingModelId,
  GoogleGenerativeAIEmbeddingSettings,
} from './google-generative-ai-embedding-settings';

type GoogleGenerativeAIEmbeddingConfig = {
  provider: string;
  baseURL: string;
  headers?: () => Promise<Record<string, string | undefined>>;
  fetch?: FetchFunction;
};

export class GoogleGenerativeAIEmbeddingModel
  implements EmbeddingModelV1<string>
{
  readonly specificationVersion = 'v1';
  readonly modelId: GoogleGenerativeAIEmbeddingModelId;

  private readonly config: GoogleGenerativeAIEmbeddingConfig;
  private readonly settings: GoogleGenerativeAIEmbeddingSettings;

  get provider(): string {
    return this.config.provider;
  }

  get maxEmbeddingsPerCall(): number {
    return 2048;
  }

  get supportsParallelCalls(): boolean {
    return true;
  }

  constructor(
    modelId: GoogleGenerativeAIEmbeddingModelId,
    settings: GoogleGenerativeAIEmbeddingSettings,
    config: GoogleGenerativeAIEmbeddingConfig,
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
      url: `${this.config.baseURL}/models/${this.modelId}:batchEmbedContents`,
      headers: combineHeaders(await this.config.headers?.(), headers),
      body: {
        requests: values.map(value => ({
          model: `models/${this.modelId}`,
          content: { role: 'user', parts: [{ text: value }] },
          outputDimensionality: this.settings.outputDimensionality,
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
      embeddings: response.embeddings.map(item => item.values),
      usage: undefined,
      rawResponse: { headers: responseHeaders },
    };
  }
}

// minimal version of the schema, focussed on what is needed for the implementation
// this approach limits breakages when the API changes and increases efficiency
const googleGenerativeAITextEmbeddingResponseSchema = z.object({
  embeddings: z.array(z.object({ values: z.array(z.number()) })),
});
