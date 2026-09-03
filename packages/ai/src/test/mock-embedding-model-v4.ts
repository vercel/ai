import type { EmbeddingModelV4 } from '@ai-sdk/provider';
import { EXPERIMENTAL_EMBEDDING_MODEL_MAX_INPUT_BYTES_PER_CALL } from '@ai-sdk/provider-utils';
import { notImplemented } from './not-implemented';

export class MockEmbeddingModelV4 implements EmbeddingModelV4 {
  readonly specificationVersion = 'v4';

  readonly provider: EmbeddingModelV4['provider'];
  readonly modelId: EmbeddingModelV4['modelId'];
  readonly maxEmbeddingsPerCall: EmbeddingModelV4['maxEmbeddingsPerCall'];
  readonly [EXPERIMENTAL_EMBEDDING_MODEL_MAX_INPUT_BYTES_PER_CALL]:
    | PromiseLike<number | undefined>
    | number
    | undefined;
  readonly supportsParallelCalls: EmbeddingModelV4['supportsParallelCalls'];

  doEmbed: EmbeddingModelV4['doEmbed'];

  doEmbedCalls: Parameters<EmbeddingModelV4['doEmbed']>[0][] = [];

  constructor({
    provider = 'mock-provider',
    modelId = 'mock-model-id',
    maxEmbeddingsPerCall = 1,
    maxInputBytesPerCall,
    supportsParallelCalls = false,
    doEmbed = notImplemented,
  }: {
    provider?: EmbeddingModelV4['provider'];
    modelId?: EmbeddingModelV4['modelId'];
    maxEmbeddingsPerCall?: EmbeddingModelV4['maxEmbeddingsPerCall'] | null;
    maxInputBytesPerCall?: PromiseLike<number | undefined> | number | undefined;
    supportsParallelCalls?: EmbeddingModelV4['supportsParallelCalls'];
    doEmbed?:
      | EmbeddingModelV4['doEmbed']
      | Awaited<ReturnType<EmbeddingModelV4['doEmbed']>>
      | Awaited<ReturnType<EmbeddingModelV4['doEmbed']>>[];
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
        return doEmbed[this.doEmbedCalls.length - 1];
      } else {
        return doEmbed;
      }
    };
  }
}
