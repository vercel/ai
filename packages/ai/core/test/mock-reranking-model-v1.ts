import { RerankingModelV1 } from '@ai-sdk/provider';
import { RerankedDocumentIndex } from '../types';
import { RerankingModelUsage } from '../types/usage';

export class MockRerankingModelV1<VALUE> implements RerankingModelV1<VALUE> {
  readonly specificationVersion = 'v1';

  readonly provider: RerankingModelV1<VALUE>['provider'];
  readonly modelId: RerankingModelV1<VALUE>['modelId'];
  readonly maxDocumentsPerCall: RerankingModelV1<VALUE>['maxDocumentsPerCall'];
  readonly supportsParallelCalls: RerankingModelV1<VALUE>['supportsParallelCalls'];
  readonly returnInput: RerankingModelV1<VALUE>['returnInput'] = false;

  doRerank: RerankingModelV1<VALUE>['doRerank'];

  constructor({
    provider = 'mock-provider',
    modelId = 'mock-model-id',
    maxDocumentsPerCall = 1,
    supportsParallelCalls = false,
    doRerank = notImplemented,
  }: {
    provider?: RerankingModelV1<VALUE>['provider'];
    modelId?: RerankingModelV1<VALUE>['modelId'];
    maxDocumentsPerCall?: RerankingModelV1<VALUE>['maxDocumentsPerCall'] | null;
    supportsParallelCalls?: RerankingModelV1<VALUE>['supportsParallelCalls'];
    doRerank?: RerankingModelV1<VALUE>['doRerank'];
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
  rerankedIndices: Array<RerankedDocumentIndex>,
  rerankedDocuments?: Array<VALUE>,
  usage?: RerankingModelUsage,
): RerankingModelV1<VALUE>['doRerank'] {
  return async ({ values }) => {
    assert.deepStrictEqual(expectedValues, values);
    return { rerankedIndices, rerankedDocuments, usage };
  };
}

function notImplemented(): never {
  throw new Error('Not implemented');
}
