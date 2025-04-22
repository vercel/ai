import { LanguageModelV2 } from '@ai-sdk/provider';
import { notImplemented } from './not-implemented';

export class MockLanguageModelV2 implements LanguageModelV2 {
  readonly specificationVersion = 'v2';

  readonly provider: LanguageModelV2['provider'];
  readonly modelId: LanguageModelV2['modelId'];

  getSupportedUrls: LanguageModelV2['getSupportedUrls'];
  doGenerate: LanguageModelV2['doGenerate'];
  doStream: LanguageModelV2['doStream'];

  doGenerateCalls: Parameters<LanguageModelV2['doGenerate']>[0][] = [];
  doStreamCalls: Parameters<LanguageModelV2['doStream']>[0][] = [];

  constructor({
    provider = 'mock-provider',
    modelId = 'mock-model-id',
    getSupportedUrls = {},
    doGenerate = notImplemented,
    doStream = notImplemented,
  }: {
    provider?: LanguageModelV2['provider'];
    modelId?: LanguageModelV2['modelId'];
    getSupportedUrls?:
      | LanguageModelV2['getSupportedUrls']
      | Awaited<ReturnType<LanguageModelV2['getSupportedUrls']>>;
    doGenerate?:
      | LanguageModelV2['doGenerate']
      | Awaited<ReturnType<LanguageModelV2['doGenerate']>>
      | Awaited<ReturnType<LanguageModelV2['doGenerate']>>[];
    doStream?:
      | LanguageModelV2['doStream']
      | Awaited<ReturnType<LanguageModelV2['doStream']>>
      | Awaited<ReturnType<LanguageModelV2['doStream']>>[];
  } = {}) {
    this.provider = provider;
    this.modelId = modelId;
    this.doGenerate = async options => {
      this.doGenerateCalls.push(options);

      if (typeof doGenerate === 'function') {
        return doGenerate(options);
      } else if (Array.isArray(doGenerate)) {
        return doGenerate[this.doGenerateCalls.length];
      } else {
        return doGenerate;
      }
    };
    this.doStream = async options => {
      this.doStreamCalls.push(options);

      if (typeof doStream === 'function') {
        return doStream(options);
      } else if (Array.isArray(doStream)) {
        return doStream[this.doStreamCalls.length];
      } else {
        return doStream;
      }
    };
    this.getSupportedUrls =
      typeof getSupportedUrls === 'function'
        ? getSupportedUrls
        : async () => getSupportedUrls;
  }
}
