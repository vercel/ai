import { EmbeddingModelV3 } from '@ai-sdk/provider';
import { notImplemented } from './not-implemented';

export class MockEmbeddingModelV2<VALUE> implements EmbeddingModelV3<VALUE> {
  readonly specificationVersion = 'v2';

  readonly provider: EmbeddingModelV3<VALUE>['provider'];
  readonly modelId: EmbeddingModelV3<VALUE>['modelId'];
  readonly maxEmbeddingsPerCall: EmbeddingModelV3<VALUE>['maxEmbeddingsPerCall'];
  readonly supportsParallelCalls: EmbeddingModelV3<VALUE>['supportsParallelCalls'];

  doEmbed: EmbeddingModelV3<VALUE>['doEmbed'];

  constructor({
    provider = 'mock-provider',
    modelId = 'mock-model-id',
    maxEmbeddingsPerCall = 1,
    supportsParallelCalls = false,
    doEmbed = notImplemented,
  }: {
    provider?: EmbeddingModelV3<VALUE>['provider'];
    modelId?: EmbeddingModelV3<VALUE>['modelId'];
    maxEmbeddingsPerCall?:
      | EmbeddingModelV3<VALUE>['maxEmbeddingsPerCall']
      | null;
    supportsParallelCalls?: EmbeddingModelV3<VALUE>['supportsParallelCalls'];
    doEmbed?: EmbeddingModelV3<VALUE>['doEmbed'];
  } = {}) {
    this.provider = provider;
    this.modelId = modelId;
    this.maxEmbeddingsPerCall = maxEmbeddingsPerCall ?? undefined;
    this.supportsParallelCalls = supportsParallelCalls;
    this.doEmbed = doEmbed;
  }
}
