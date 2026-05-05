import {
  TooManyEmbeddingValuesForCallError,
  type EmbeddingModelV4,
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
  alibabaEmbeddingModelOptions,
  type AlibabaEmbeddingModelOptions,
} from './alibaba-embedding-model-options';
import {
  modelMaxEmbeddingsPerCall,
  type AlibabaEmbeddingModelId,
} from './alibaba-embedding-settings';
import { alibabaFailedResponseHandler } from './alibaba-error';

type AlibabaEmbeddingConfig = {
  provider: string;
  baseURL: string;
  headers?: () => Record<string, string | undefined>;
  fetch?: FetchFunction;
};

export class AlibabaEmbeddingModel implements EmbeddingModelV4 {
  readonly specificationVersion = 'v4';
  readonly modelId: AlibabaEmbeddingModelId;

  private readonly config: AlibabaEmbeddingConfig;

  get provider(): string {
    return this.config.provider;
  }

  get maxEmbeddingsPerCall(): number {
    return modelMaxEmbeddingsPerCall[this.modelId] ?? 10;
  }

  get supportsParallelCalls(): boolean {
    return false;
  }

  static [WORKFLOW_SERIALIZE](model: AlibabaEmbeddingModel) {
    return serializeModelOptions({
      modelId: model.modelId,
      config: model.config,
    });
  }

  static [WORKFLOW_DESERIALIZE](options: {
    modelId: AlibabaEmbeddingModelId;
    config: AlibabaEmbeddingConfig;
  }) {
    return new AlibabaEmbeddingModel(options.modelId, options.config);
  }

  constructor(
    modelId: AlibabaEmbeddingModelId,
    config: AlibabaEmbeddingConfig,
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
    if (values.length > this.maxEmbeddingsPerCall) {
      throw new TooManyEmbeddingValuesForCallError({
        provider: this.provider,
        modelId: this.modelId,
        maxEmbeddingsPerCall: this.maxEmbeddingsPerCall,
        values,
      });
    }

    const options =
      (await parseProviderOptions({
        provider: 'alibaba',
        providerOptions,
        schema: alibabaEmbeddingModelOptions,
      })) ?? ({} as AlibabaEmbeddingModelOptions);

    const {
      responseHeaders,
      value: response,
      rawValue,
    } = await postJsonToApi({
      url: `${this.config.baseURL}/embeddings`,
      headers: combineHeaders(this.config.headers?.(), headers),
      body: {
        model: this.modelId,
        input: values,
        encoding_format: 'float',
        ...(options.dimensions != null
          ? { dimensions: options.dimensions }
          : {}),
        ...(options.text_type != null ? { text_type: options.text_type } : {}),
        ...(options.output_type != null
          ? { output_type: options.output_type }
          : {}),
      },
      failedResponseHandler: alibabaFailedResponseHandler,
      successfulResponseHandler: createJsonResponseHandler(
        alibabaTextEmbeddingResponseSchema,
      ),
      abortSignal,
      fetch: this.config.fetch,
    });

    return {
      warnings: [],
      embeddings: response.data.map(item => item.embedding),
      usage: response.usage
        ? { tokens: response.usage.prompt_tokens }
        : undefined,
      response: { headers: responseHeaders, body: rawValue },
    };
  }
}

const alibabaTextEmbeddingResponseSchema = z.object({
  data: z.array(z.object({ embedding: z.array(z.number()) })),
  usage: z.object({ prompt_tokens: z.number() }).nullish(),
});
