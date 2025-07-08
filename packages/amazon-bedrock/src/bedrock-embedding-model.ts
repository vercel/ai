import {
  EmbeddingModelV2,
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

type DoEmbedResponse = Awaited<ReturnType<EmbeddingModelV2<string>['doEmbed']>>;

export class BedrockEmbeddingModel implements EmbeddingModelV2<string> {
  readonly specificationVersion = 'v2';
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
  }: Parameters<
    EmbeddingModelV2<string>['doEmbed']
  >[0]): Promise<DoEmbedResponse> {
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
    const args = {
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
      embeddings: [response.embedding],
      usage: { tokens: response.inputTextTokenCount },
    };
  }
}

const BedrockEmbeddingResponseSchema = z.object({
  embedding: z.array(z.number()),
  inputTextTokenCount: z.number(),
});
