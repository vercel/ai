import { EmbeddingModelV1 } from '@ai-sdk/provider';
import {
  createJsonResponseHandler,
  postJsonToApi,
} from '@ai-sdk/provider-utils';
import { z } from 'zod';
import {
  MistralEmbeddingModelId,
  MistralEmbeddingSettings,
} from './mistral-embedding-settings';
import { mistralFailedResponseHandler } from './mistral-error';

type MistralEmbeddingConfig = {
  provider: string;
  baseURL: string;
  headers: () => Record<string, string | undefined>;
};

export class MistralEmbeddingModel implements EmbeddingModelV1<string> {
  readonly specificationVersion = 'v1';
  readonly defaultObjectGenerationMode = 'json';

  readonly modelId: MistralEmbeddingModelId;

  private readonly config: MistralEmbeddingConfig;

  constructor(
    modelId: MistralEmbeddingModelId,
    settings: MistralEmbeddingSettings,
    config: MistralEmbeddingConfig,
  ) {
    this.modelId = modelId;
    this.config = config;
  }

  get provider(): string {
    return this.config.provider;
  }

  async doEmbed(
    options: Parameters<EmbeddingModelV1<string>['doEmbed']>[0],
  ): Promise<Awaited<ReturnType<EmbeddingModelV1<string>['doEmbed']>>> {
    const { values } = options;

    const { responseHeaders, value: response } = await postJsonToApi({
      url: `${this.config.baseURL}/embeddings`,
      headers: this.config.headers(),
      body: {
        model: this.modelId,
        input: values,
        encoding_format: 'float',
      },
      failedResponseHandler: mistralFailedResponseHandler,
      successfulResponseHandler: createJsonResponseHandler(
        MistralTextEmbeddingResponseSchema,
      ),
      // abortSignal: options.abortSignal,
    });

    // TODO raw headers, abort signal

    return {
      embeddings: response.data.map(item => item.embedding),
    };
  }
}

// minimal version of the schema, focussed on what is needed for the implementation
// this approach limits breakages when the API changes and increases efficiency
const MistralTextEmbeddingResponseSchema = z.object({
  data: z.array(
    z.object({
      embedding: z.array(z.number()),
    }),
  ),
});
