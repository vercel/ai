import {
  EmbeddingModelV3,
  TooManyEmbeddingValuesForCallError,
} from '@ai-sdk/provider';
import {
  FetchFunction,
  Resolvable,
  combineHeaders,
  createJsonErrorResponseHandler,
  createJsonResponseHandler,
  parseProviderOptions,
  postJsonToApi,
  resolve,
} from '@ai-sdk/provider-utils';
import {
  BedrockEmbeddingModelId,
  bedrockEmbeddingProviderOptions,
} from './bedrock-embedding-options';
import { BedrockErrorSchema } from './bedrock-error';
import { z } from 'zod/v4';

type BedrockEmbeddingConfig = {
  baseUrl: () => string;
  headers: Resolvable<Record<string, string | undefined>>;
  fetch?: FetchFunction;
};

type DoEmbedResponse = Awaited<ReturnType<EmbeddingModelV3['doEmbed']>>;

export class BedrockEmbeddingModel implements EmbeddingModelV3 {
  readonly specificationVersion = 'v3';
  readonly provider = 'amazon-bedrock';
  readonly maxEmbeddingsPerCall = 1;
  readonly supportsParallelCalls = true;

  constructor(
    readonly modelId: BedrockEmbeddingModelId,
    private readonly config: BedrockEmbeddingConfig,
  ) {}

  private getUrl(modelId: string): string {
    const encodedModelId = encodeURIComponent(modelId);
    return `${this.config.baseUrl()}/model/${encodedModelId}/invoke`;
  }

  async doEmbed({
    values,
    headers,
    abortSignal,
    providerOptions,
  }: Parameters<EmbeddingModelV3['doEmbed']>[0]): Promise<DoEmbedResponse> {
    if (values.length > this.maxEmbeddingsPerCall) {
      throw new TooManyEmbeddingValuesForCallError({
        provider: this.provider,
        modelId: this.modelId,
        maxEmbeddingsPerCall: this.maxEmbeddingsPerCall,
        values,
      });
    }

    // Parse provider options
    const bedrockOptions =
      (await parseProviderOptions({
        provider: 'bedrock',
        providerOptions,
        schema: bedrockEmbeddingProviderOptions,
      })) ?? {};

    // https://docs.aws.amazon.com/bedrock/latest/APIReference/API_runtime_InvokeModel.html
    // Note: Different embedding model families expect different request/response
    const args = this.modelId.startsWith('amazon.nova-') && this.modelId.includes('embeddings')
      ? {
          taskType: 'SINGLE_EMBEDDING',
          singleEmbeddingParams: {
            embeddingPurpose: bedrockOptions.embeddingPurpose ?? 'GENERIC_INDEX',
            embeddingDimension: bedrockOptions.embeddingDimension ?? 1024,
            text: {
              truncationMode: bedrockOptions.truncationMode ?? 'END',
              value: values[0],
            },
          },
        }
      : {
          inputText: values[0],
          dimensions: bedrockOptions.dimensions,
          normalize: bedrockOptions.normalize,
        };

    const url = this.getUrl(this.modelId);
    const { value: response } = await postJsonToApi({
      url,
      headers: await resolve(
        combineHeaders(await resolve(this.config.headers), headers),
      ),
      body: args,
      failedResponseHandler: createJsonErrorResponseHandler({
        errorSchema: BedrockErrorSchema,
        errorToMessage: error => `${error.type}: ${error.message}`,
      }),
      successfulResponseHandler: createJsonResponseHandler(
        BedrockEmbeddingResponseSchema,
      ),
      fetch: this.config.fetch,
      abortSignal,
    });

    const isNovaResponse = 'embeddings' in response;
    const embedding = isNovaResponse
      ? response.embeddings[0].embedding
      : response.embedding;
    const tokens = isNovaResponse
      ? (response.inputTokenCount ?? 0)
      : response.inputTextTokenCount;

    return {
      embeddings: [embedding],
      usage: { tokens },
      warnings: [],
    };
  }
}

const BedrockEmbeddingResponseSchema = z.union([
  z.object({
    embeddings: z.array(
      z.object({
        embeddingType: z.string(),
        embedding: z.array(z.number()),
      }),
    ),
    inputTokenCount: z.number().optional(),
  }),
  z.object({
    embedding: z.array(z.number()),
    inputTextTokenCount: z.number(),
  }),
]);
