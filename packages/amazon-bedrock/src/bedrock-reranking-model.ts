import { RerankingModelV1 } from '@ai-sdk/provider';
import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from '@aws-sdk/client-bedrock-runtime';

import {
  BedrockRerankingModelId,
  BedrockRerankingSettings,
} from './bedrock-reranking-settings';

type BedrockRerankingConfig = {
  client: BedrockRuntimeClient;
};

export class BedrockRerankingModel implements RerankingModelV1<string> {
  readonly specificationVersion = 'v1';
  readonly modelId: BedrockRerankingModelId;
  readonly provider = 'amazon-bedrock';
  readonly maxDocumentsPerCall = undefined;
  readonly supportsParallelCalls = true;
  readonly returnInput = true;
  private readonly config: BedrockRerankingConfig;
  private readonly settings: BedrockRerankingSettings;

  constructor(
    modelId: BedrockRerankingModelId,
    settings: BedrockRerankingSettings,
    config: BedrockRerankingConfig,
  ) {
    this.modelId = modelId;
    this.settings = settings;
    this.config = config;
  }

  async doRerank({
    values,
    query,
    topK,
    returnDocuments,
  }: Parameters<RerankingModelV1<string>['doRerank']>[0]): Promise<
    Awaited<ReturnType<RerankingModelV1<string>['doRerank']>>
  > {
    const payload = {
      query: query,
      documents: values,
      top_n: topK,
    };

    const command = new InvokeModelCommand({
      contentType: 'application/json',
      body: JSON.stringify(payload),
      modelId: this.modelId,
    });

    const rawResponse = await this.config.client.send(command);

    const parsed: {
      results: {
        index: number;
        relevance_score: number;
      }[];
    } = JSON.parse(new TextDecoder().decode(rawResponse.body));

    return {
      rerankedIndices: parsed.results.map(result => result.index),
      rerankedDocuments: returnDocuments
        ? parsed.results.map(result => values[result.index])
        : undefined,
    };
  }
}
