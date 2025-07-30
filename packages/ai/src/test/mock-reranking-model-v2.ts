import { RerankedDocument, RerankingModelV2 } from '@ai-sdk/provider';
import { RerankingModelUsage } from '../types/usage';
import { notImplemented } from './not-implemented';

export class MockRerankingModelV2<VALUE> implements RerankingModelV2<VALUE> {
  readonly specificationVersion = 'v2';

  readonly provider: RerankingModelV2<VALUE>['provider'];
  readonly modelId: RerankingModelV2<VALUE>['modelId'];
  readonly maxDocumentsPerCall: RerankingModelV2<VALUE>['maxDocumentsPerCall'];

  doRerank: RerankingModelV2<VALUE>['doRerank'];

  constructor({
    provider = 'mock-provider',
    modelId = 'mock-model-id',
    maxDocumentsPerCall = undefined,
    doRerank = notImplemented,
  }: {
    provider?: RerankingModelV2<VALUE>['provider'];
    modelId?: RerankingModelV2<VALUE>['modelId'];
    maxDocumentsPerCall?: RerankingModelV2<VALUE>['maxDocumentsPerCall'];
    doRerank?: RerankingModelV2<VALUE>['doRerank'];
  } = {}) {
    this.provider = provider;
    this.modelId = modelId;
    this.maxDocumentsPerCall = maxDocumentsPerCall;
    this.doRerank = doRerank;
  }
}

export function mockRerank<VALUE>(
  expectedValues: Array<VALUE>,
  rerankedDocuments: Array<RerankedDocument<VALUE>>,
  usage?: RerankingModelUsage,
  response: Awaited<
    ReturnType<RerankingModelV2<VALUE>['doRerank']>
  >['response'] = { headers: {}, body: {} },
): RerankingModelV2<VALUE>['doRerank'] {
  return async ({ values }) => {
    assert.deepStrictEqual(expectedValues, values);
    return { rerankedDocuments, usage, response };
  };
}
