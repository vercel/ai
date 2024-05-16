import { EmbeddingModelV1 } from '@ai-sdk/provider';

export class MockEmbeddingModelV1<VALUE> implements EmbeddingModelV1<VALUE> {
  readonly specificationVersion = 'v1';

  readonly provider: EmbeddingModelV1<VALUE>['provider'];
  readonly modelId: EmbeddingModelV1<VALUE>['modelId'];
  readonly maxEmbeddingsPerCall: EmbeddingModelV1<VALUE>['maxEmbeddingsPerCall'];
  readonly supportsParallelCalls: EmbeddingModelV1<VALUE>['supportsParallelCalls'];

  doEmbed: EmbeddingModelV1<VALUE>['doEmbed'];

  constructor({
    provider = 'mock-provider',
    modelId = 'mock-model-id',
    maxEmbeddingsPerCall = 1,
    supportsParallelCalls = false,
    doEmbed = notImplemented,
  }: {
    provider?: EmbeddingModelV1<VALUE>['provider'];
    modelId?: EmbeddingModelV1<VALUE>['modelId'];
    maxEmbeddingsPerCall?: EmbeddingModelV1<VALUE>['maxEmbeddingsPerCall'];
    supportsParallelCalls?: EmbeddingModelV1<VALUE>['supportsParallelCalls'];
    doEmbed?: EmbeddingModelV1<VALUE>['doEmbed'];
  }) {
    this.provider = provider;
    this.modelId = modelId;
    this.maxEmbeddingsPerCall = maxEmbeddingsPerCall;
    this.supportsParallelCalls = supportsParallelCalls;
    this.doEmbed = doEmbed;
  }
}

function notImplemented(): never {
  throw new Error('Not implemented');
}
