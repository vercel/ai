import { RerankingModelV3 } from '@ai-sdk/provider';
import { notImplemented } from './not-implemented';

export class MockRerankingModelV3 implements RerankingModelV3 {
  readonly specificationVersion = 'v3';

  readonly provider: RerankingModelV3['provider'];
  readonly modelId: RerankingModelV3['modelId'];
  readonly maxDocumentsPerCall: RerankingModelV3['maxDocumentsPerCall'];

  doRerank: RerankingModelV3['doRerank'];

  constructor({
    provider = 'mock-provider',
    modelId = 'mock-model-id',
    maxDocumentsPerCall = undefined,
    doRerank = notImplemented,
  }: {
    provider?: RerankingModelV3['provider'];
    modelId?: RerankingModelV3['modelId'];
    maxDocumentsPerCall?: RerankingModelV3['maxDocumentsPerCall'];
    doRerank?: RerankingModelV3['doRerank'];
  } = {}) {
    this.provider = provider;
    this.modelId = modelId;
    this.maxDocumentsPerCall = maxDocumentsPerCall;
    this.doRerank = doRerank;
  }
}
