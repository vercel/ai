import type { RerankingModelV4 } from '@ai-sdk/provider';
import { notImplemented } from './not-implemented';

export class MockRerankingModelV4 implements RerankingModelV4 {
  readonly specificationVersion = 'v4';

  readonly provider: RerankingModelV4['provider'];
  readonly modelId: RerankingModelV4['modelId'];
  readonly maxDocumentsPerCall: RerankingModelV4['maxDocumentsPerCall'];
  readonly supportsParallelCalls: RerankingModelV4['supportsParallelCalls'];

  doRerank: RerankingModelV4['doRerank'];

  doRerankCalls: Parameters<RerankingModelV4['doRerank']>[0][] = [];

  constructor({
    provider = 'mock-provider',
    modelId = 'mock-model-id',
    maxDocumentsPerCall,
    supportsParallelCalls = false,
    doRerank = notImplemented,
  }: {
    provider?: RerankingModelV4['provider'];
    modelId?: RerankingModelV4['modelId'];
    maxDocumentsPerCall?: RerankingModelV4['maxDocumentsPerCall'] | null;
    supportsParallelCalls?: RerankingModelV4['supportsParallelCalls'];
    doRerank?:
      | RerankingModelV4['doRerank']
      | Awaited<ReturnType<RerankingModelV4['doRerank']>>
      | Awaited<ReturnType<RerankingModelV4['doRerank']>>[];
  } = {}) {
    this.provider = provider;
    this.modelId = modelId;
    this.maxDocumentsPerCall = maxDocumentsPerCall ?? undefined;
    this.supportsParallelCalls = supportsParallelCalls;
    this.doRerank = async options => {
      this.doRerankCalls.push(options);

      if (typeof doRerank === 'function') {
        return doRerank(options);
      } else if (Array.isArray(doRerank)) {
        return doRerank[this.doRerankCalls.length - 1];
      } else {
        return doRerank;
      }
    };
  }
}
