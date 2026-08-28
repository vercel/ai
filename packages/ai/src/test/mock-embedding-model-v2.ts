import type { EmbeddingModelV2 } from '@ai-sdk/provider';
import { EXPERIMENTAL_EMBEDDING_MODEL_MAX_INPUT_BYTES_PER_CALL } from '@ai-sdk/provider-utils';
import { notImplemented } from './not-implemented';

export class MockEmbeddingModelV2<VALUE> implements EmbeddingModelV2<VALUE> {
  readonly specificationVersion = 'v2';

  readonly provider: EmbeddingModelV2<VALUE>['provider'];
  readonly modelId: EmbeddingModelV2<VALUE>['modelId'];
  readonly maxEmbeddingsPerCall: EmbeddingModelV2<VALUE>['maxEmbeddingsPerCall'];
  readonly [EXPERIMENTAL_EMBEDDING_MODEL_MAX_INPUT_BYTES_PER_CALL]:
    | PromiseLike<number | undefined>
    | number
    | undefined;
  readonly supportsParallelCalls: EmbeddingModelV2<VALUE>['supportsParallelCalls'];

  doEmbed: EmbeddingModelV2<VALUE>['doEmbed'];

  doEmbedCalls: Parameters<EmbeddingModelV2<VALUE>['doEmbed']>[0][] = [];

  constructor({
    provider = 'mock-provider',
    modelId = 'mock-model-id',
    maxEmbeddingsPerCall = 1,
    maxInputBytesPerCall,
    supportsParallelCalls = false,
    doEmbed = notImplemented,
  }: {
    provider?: EmbeddingModelV2<VALUE>['provider'];
    modelId?: EmbeddingModelV2<VALUE>['modelId'];
    maxEmbeddingsPerCall?:
      | EmbeddingModelV2<VALUE>['maxEmbeddingsPerCall']
      | null;
    maxInputBytesPerCall?: PromiseLike<number | undefined> | number | undefined;
    supportsParallelCalls?: EmbeddingModelV2<VALUE>['supportsParallelCalls'];
    doEmbed?: EmbeddingModelV2<VALUE>['doEmbed'];
  } = {}) {
    this.provider = provider;
    this.modelId = modelId;
    this.maxEmbeddingsPerCall = maxEmbeddingsPerCall ?? undefined;
    this[EXPERIMENTAL_EMBEDDING_MODEL_MAX_INPUT_BYTES_PER_CALL] =
      maxInputBytesPerCall;
    this.supportsParallelCalls = supportsParallelCalls;
    this.doEmbed = async options => {
      this.doEmbedCalls.push(options);
      return doEmbed(options);
    };
  }
}
