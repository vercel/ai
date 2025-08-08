import { EmbeddingModelV2 } from '@ai-sdk/provider';
import { Embedding } from '../types';
import { EmbeddingModelUsage } from '../types/usage';
import { notImplemented } from './not-implemented';

export class MockEmbeddingModelV2<VALUE> implements EmbeddingModelV2<VALUE> {
  readonly specificationVersion = 'v2';

  readonly provider: EmbeddingModelV2<VALUE>['provider'];
  readonly modelId: EmbeddingModelV2<VALUE>['modelId'];
  readonly maxEmbeddingsPerCall: EmbeddingModelV2<VALUE>['maxEmbeddingsPerCall'];
  readonly supportsParallelCalls: EmbeddingModelV2<VALUE>['supportsParallelCalls'];

  doEmbed: EmbeddingModelV2<VALUE>['doEmbed'];

  constructor({
    provider = 'mock-provider',
    modelId = 'mock-model-id',
    maxEmbeddingsPerCall = 1,
    supportsParallelCalls = false,
    doEmbed = notImplemented,
  }: {
    provider?: EmbeddingModelV2<VALUE>['provider'];
    modelId?: EmbeddingModelV2<VALUE>['modelId'];
    maxEmbeddingsPerCall?:
      | EmbeddingModelV2<VALUE>['maxEmbeddingsPerCall']
      | null;
    supportsParallelCalls?: EmbeddingModelV2<VALUE>['supportsParallelCalls'];
    doEmbed?: EmbeddingModelV2<VALUE>['doEmbed'];
  } = {}) {
    this.provider = provider;
    this.modelId = modelId;
    this.maxEmbeddingsPerCall = maxEmbeddingsPerCall ?? undefined;
    this.supportsParallelCalls = supportsParallelCalls;
    this.doEmbed = doEmbed;
  }
}

export function mockEmbed<VALUE>(
  expectedValues: Array<VALUE>,
  embeddings: Array<Embedding>,
  usage?: EmbeddingModelUsage,
  response: Awaited<
    ReturnType<EmbeddingModelV2<VALUE>['doEmbed']>
  >['response'] = { headers: {}, body: {} },
  providerMetadata?: Awaited<
    ReturnType<EmbeddingModelV2<VALUE>['doEmbed']>
  >['providerMetadata'],
): EmbeddingModelV2<VALUE>['doEmbed'] {
  return async ({ values }) => {
    assert.deepStrictEqual(expectedValues, values);
    return { embeddings, usage, response, providerMetadata };
  };
}
