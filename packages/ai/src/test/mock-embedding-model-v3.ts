import { EmbeddingModelV3 } from '@ai-sdk/provider';
import { notImplemented } from './not-implemented';

export class MockEmbeddingModelV3<VALUE> implements EmbeddingModelV3<VALUE> {
  readonly specificationVersion = 'v3';

  readonly provider: EmbeddingModelV3<VALUE>['provider'];
  readonly modelId: EmbeddingModelV3<VALUE>['modelId'];
  readonly maxEmbeddingsPerCall: EmbeddingModelV3<VALUE>['maxEmbeddingsPerCall'];
  readonly supportsParallelCalls: EmbeddingModelV3<VALUE>['supportsParallelCalls'];

  doEmbed: EmbeddingModelV3<VALUE>['doEmbed'];

  doEmbedCalls: Parameters<EmbeddingModelV3<VALUE>['doEmbed']>[0][] = [];

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
    doEmbed?:
      | EmbeddingModelV3<VALUE>['doEmbed']
      | Awaited<ReturnType<EmbeddingModelV3<VALUE>['doEmbed']>>
      | Awaited<ReturnType<EmbeddingModelV3<VALUE>['doEmbed']>>[];
  } = {}) {
    this.provider = provider;
    this.modelId = modelId;
    this.maxEmbeddingsPerCall = maxEmbeddingsPerCall ?? undefined;
    this.supportsParallelCalls = supportsParallelCalls;
    this.doEmbed = async options => {
      this.doEmbedCalls.push(options);

      if (typeof doEmbed === 'function') {
        return doEmbed(options);
      } else if (Array.isArray(doEmbed)) {
        return doEmbed[this.doEmbedCalls.length];
      } else {
        return doEmbed;
      }
    };
  }
}
