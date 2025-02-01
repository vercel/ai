import { EmbeddingModelV1, EmbeddingModelV1Embedding } from '@ai-sdk/provider';
import {
  FetchFunction,
  createJsonErrorResponseHandler,
  postJsonToApi,
  resolve,
} from '@ai-sdk/provider-utils';
import {
  BedrockEmbeddingModelId,
  BedrockEmbeddingSettings,
} from './bedrock-embedding-settings';
import { BedrockErrorSchema } from './bedrock-error';
import { BedrockHeadersFunction } from './bedrock-api-types';

type BedrockEmbeddingConfig = {
  baseUrl: () => string;
  headers: BedrockHeadersFunction;
  fetch?: FetchFunction;
};

type DoEmbedResponse = Awaited<ReturnType<EmbeddingModelV1<string>['doEmbed']>>;

export class BedrockEmbeddingModel implements EmbeddingModelV1<string> {
  readonly specificationVersion = 'v1';
  readonly provider = 'amazon-bedrock';
  readonly maxEmbeddingsPerCall = undefined;
  readonly supportsParallelCalls = true;

  constructor(
    readonly modelId: BedrockEmbeddingModelId,
    private readonly settings: BedrockEmbeddingSettings,
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
  }: Parameters<
    EmbeddingModelV1<string>['doEmbed']
  >[0]): Promise<DoEmbedResponse> {
    const embedSingleText = async (inputText: string) => {
      // https://docs.aws.amazon.com/bedrock/latest/APIReference/API_runtime_InvokeModel.html
      const args = {
        inputText,
        dimensions: this.settings.dimensions,
        normalize: this.settings.normalize,
      };
      const url = this.getUrl(this.modelId);
      const { value: response } = await postJsonToApi({
        url,
        headers: await resolve(
          this.config.headers({
            url,
            headers: headers ?? {},
            body: args,
          }),
        ),
        body: args,
        failedResponseHandler: createJsonErrorResponseHandler({
          errorSchema: BedrockErrorSchema,
          errorToMessage: error => `${error.type}: ${error.message}`,
        }),
        successfulResponseHandler: async response => {
          const binaryData = await response.response.arrayBuffer();
          const jsonString = new TextDecoder().decode(
            new Uint8Array(binaryData),
          );
          const parsed = JSON.parse(jsonString);
          return { value: parsed };
        },
        fetch: this.config.fetch,
        abortSignal,
      });

      return {
        embedding: response.embedding,
        inputTextTokenCount: response.inputTextTokenCount,
      };
    };

    const responses = await Promise.all(values.map(embedSingleText));
    return responses.reduce<{
      embeddings: EmbeddingModelV1Embedding[];
      usage: { tokens: number };
    }>(
      (accumulated, response) => {
        accumulated.embeddings.push(response.embedding);
        accumulated.usage.tokens += response.inputTextTokenCount;
        return accumulated;
      },
      { embeddings: [], usage: { tokens: 0 } },
    );
  }
}
