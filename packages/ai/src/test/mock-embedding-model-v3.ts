import type { EmbeddingModelV3 } from '@ai-sdk/provider';
import { EXPERIMENTAL_EMBEDDING_MODEL_MAX_INPUT_BYTES_PER_CALL } from '@ai-sdk/provider-utils';
import { notImplemented } from './not-implemented';

export class MockEmbeddingModelV3 implements EmbeddingModelV3 {
  readonly specificationVersion = 'v3';

  readonly provider: EmbeddingModelV3['provider'];
  readonly modelId: EmbeddingModelV3['modelId'];
  readonly maxEmbeddingsPerCall: EmbeddingModelV3['maxEmbeddingsPerCall'];
  readonly [EXPERIMENTAL_EMBEDDING_MODEL_MAX_INPUT_BYTES_PER_CALL]:
    | PromiseLike<number | undefined>
    | number
    | undefined;
  readonly supportsParallelCalls: EmbeddingModelV3['supportsParallelCalls'];

  doEmbed: EmbeddingModelV3['doEmbed'];

  doEmbedCalls: Parameters<EmbeddingModelV3['doEmbed']>[0][] = [];

  constructor({
    provider = 'mock-provider',
    modelId = 'mock-model-id',
    maxEmbeddingsPerCall = 1,
    maxInputBytesPerCall,
    supportsParallelCalls = false,
    doEmbed = notImplemented,
  }: {
    provider?: EmbeddingModelV3['provider'];
    modelId?: EmbeddingModelV3['modelId'];
    maxEmbeddingsPerCall?: EmbeddingModelV3['maxEmbeddingsPerCall'] | null;
    maxInputBytesPerCall?: PromiseLike<number | undefined> | number | undefined;
    supportsParallelCalls?: EmbeddingModelV3['supportsParallelCalls'];
    doEmbed?:
      | EmbeddingModelV3['doEmbed']
      | Awaited<ReturnType<EmbeddingModelV3['doEmbed']>>
      | Awaited<ReturnType<EmbeddingModelV3['doEmbed']>>[];
  } = {}) {
    this.provider = provider;
    this.modelId = modelId;
    this.maxEmbeddingsPerCall = maxEmbeddingsPerCall ?? undefined;
    this[EXPERIMENTAL_EMBEDDING_MODEL_MAX_INPUT_BYTES_PER_CALL] =
      maxInputBytesPerCall;
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
