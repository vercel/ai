import { EmbeddingModelV1 } from '@ai-sdk/provider';
import {
  BedrockEmbeddingModelId,
  BedrockEmbeddingSettings,
} from './bedrock-embedding-settings';
import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from '@aws-sdk/client-bedrock-runtime';

type BedrockEmbeddingConfig = {
  client: BedrockRuntimeClient;
};

type DoEmbedResponse = Awaited<ReturnType<EmbeddingModelV1<string>['doEmbed']>>;

export class BedrockEmbeddingModel implements EmbeddingModelV1<string> {
  readonly specificationVersion = 'v1';
  readonly modelId: BedrockEmbeddingModelId;
  readonly provider = 'amazon-bedrock';
  readonly maxEmbeddingsPerCall = undefined;
  readonly supportsParallelCalls = true;
  private readonly config: BedrockEmbeddingConfig;
  private readonly settings: BedrockEmbeddingSettings;

  constructor(
    modelId: BedrockEmbeddingModelId,
    settings: BedrockEmbeddingSettings,
    config: BedrockEmbeddingConfig,
  ) {
    this.modelId = modelId;
    this.config = config;
    this.settings = settings;
  }

  async doEmbed({
    values,
  }: Parameters<
    EmbeddingModelV1<string>['doEmbed']
  >[0]): Promise<DoEmbedResponse> {
    const fn = async (inputText: string) => {
      const payload = {
        inputText,
        dimensions: this.settings.dimensions,
        normalize: this.settings.normalize,
      };

      const command = new InvokeModelCommand({
        contentType: 'application/json',
        body: JSON.stringify(payload),
        modelId: this.modelId,
      });
      const rawResponse = await this.config.client.send(command);

      const parsed = JSON.parse(new TextDecoder().decode(rawResponse.body));

      return parsed;
    };

    const responses = await Promise.all(values.map(fn));

    const response = responses.reduce(
      (acc, r) => {
        acc.embeddings.push(r.embedding);
        acc.usage.tokens += r.inputTextTokenCount;
        return acc;
      },
      { embeddings: [], usage: { tokens: 0 } },
    );

    return response;
  }
}
