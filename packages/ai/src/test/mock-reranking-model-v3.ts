import { RerankedDocument, RerankingModelV3 } from '@ai-sdk/provider';
import { RerankingModelUsage } from '../types/usage';
import { notImplemented } from './not-implemented';
import assert from 'node:assert';

export class MockRerankingModelV3<VALUE> implements RerankingModelV3<VALUE> {
  readonly specificationVersion = 'v3';

  readonly provider: RerankingModelV3<VALUE>['provider'];
  readonly modelId: RerankingModelV3<VALUE>['modelId'];
  readonly maxDocumentsPerCall: RerankingModelV3<VALUE>['maxDocumentsPerCall'];

  doRerank: RerankingModelV3<VALUE>['doRerank'];

  constructor({
    provider = 'mock-provider',
    modelId = 'mock-model-id',
    maxDocumentsPerCall = undefined,
    doRerank = notImplemented,
  }: {
    provider?: RerankingModelV3<VALUE>['provider'];
    modelId?: RerankingModelV3<VALUE>['modelId'];
    maxDocumentsPerCall?: RerankingModelV3<VALUE>['maxDocumentsPerCall'];
    doRerank?: RerankingModelV3<VALUE>['doRerank'];
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
    ReturnType<RerankingModelV3<VALUE>['doRerank']>
  >['response'] = { headers: {}, body: {} },
  providerMetadata?: Awaited<
    ReturnType<RerankingModelV3<VALUE>['doRerank']>
  >['providerMetadata'],
): RerankingModelV3<VALUE>['doRerank'] {
  return async ({ values }) => {
    assert.deepStrictEqual(expectedValues, values);
    return { rerankedDocuments, usage, response, providerMetadata };
  };
}
