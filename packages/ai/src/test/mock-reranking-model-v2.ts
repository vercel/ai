import { RerankingModelV2 } from '@ai-sdk/provider';
import { RerankedResultIndex } from '../types';
import { RerankingModelUsage } from '../types/usage';
import { notImplemented } from './not-implemented';

export class MockRerankingModelV2<VALUE> implements RerankingModelV2<VALUE> {
  readonly specificationVersion = 'v2';

  readonly provider: RerankingModelV2<VALUE>['provider'];
  readonly modelId: RerankingModelV2<VALUE>['modelId'];
  readonly maxDocumentsPerCall: RerankingModelV2<VALUE>['maxDocumentsPerCall'];
  readonly supportsParallelCalls: RerankingModelV2<VALUE>['supportsParallelCalls'];
  readonly returnInput: RerankingModelV2<VALUE>['returnInput'] = false;

  doRerank: RerankingModelV2<VALUE>['doRerank'];

  constructor({
    provider = 'mock-provider',
    modelId = 'mock-model-id',
    maxDocumentsPerCall = 1,
    supportsParallelCalls = false,
    doRerank = notImplemented,
  }: {
    provider?: RerankingModelV2<VALUE>['provider'];
    modelId?: RerankingModelV2<VALUE>['modelId'];
    maxDocumentsPerCall?: RerankingModelV2<VALUE>['maxDocumentsPerCall'] | null;
    supportsParallelCalls?: RerankingModelV2<VALUE>['supportsParallelCalls'];
    doRerank?: RerankingModelV2<VALUE>['doRerank'];
  } = {}) {
    this.provider = provider;
    this.modelId = modelId;
    this.maxDocumentsPerCall = maxDocumentsPerCall ?? undefined;
    this.supportsParallelCalls = supportsParallelCalls;
    this.doRerank = doRerank;
  }
}

export function mockRerank<VALUE>(
  expectedValues: Array<VALUE>,
  rerankedIndices: Array<RerankedResultIndex>,
  rerankedDocuments?: Array<VALUE>,
  usage?: RerankingModelUsage,
  response: Awaited<
    ReturnType<RerankingModelV2<VALUE>['doRerank']>
  >['response'] = { headers: {}, body: {} },
): RerankingModelV2<VALUE>['doRerank'] {
  return async ({ values }) => {
    assert.deepStrictEqual(expectedValues, values);
    return { rerankedIndices, rerankedDocuments, usage, response };
  };
}
