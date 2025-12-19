import {
  EmbeddingModelV3,
  TooManyEmbeddingValuesForCallError,
  type SharedV3Warning,
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

function isNovaEmbeddingModel(modelId: string): boolean {
  // Nova embedding models (e.g. amazon.nova-2-multimodal-embeddings-v1:0)
  // use a chat-like "messages" input schema rather than "inputText".
  return modelId.startsWith('amazon.nova-') && modelId.includes('embeddings');
}

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

    const warnings: SharedV3Warning[] = [];

    if (isNovaEmbeddingModel(this.modelId)) {
      if (bedrockOptions.dimensions != null) {
        warnings.push({
          type: 'unsupported',
          feature: 'dimensions',
        });
      }

      if (bedrockOptions.normalize != null) {
        warnings.push({
          type: 'unsupported',
          feature: 'normalize',
        });
      }
    }

    // https://docs.aws.amazon.com/bedrock/latest/APIReference/API_runtime_InvokeModel.html
    // Note: Different embedding model families expect different request/response
    const args = isNovaEmbeddingModel(this.modelId)
      ? { messages: [{ role: 'user', content: [{ text: values[0] }] }] }
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

    return {
      warnings,
      embeddings: [response.embedding],
      usage: { tokens: response.inputTextTokenCount },
    };
  }
}

const BedrockEmbeddingResponseSchema = z.object({
  embedding: z.array(z.number()),
  inputTextTokenCount: z.number(),
});
