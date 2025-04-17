import { LanguageModelV2 } from '@ai-sdk/provider';
import { notImplemented } from './not-implemented';

export class MockLanguageModelV2 implements LanguageModelV2 {
  readonly specificationVersion = 'v2';

  readonly provider: LanguageModelV2['provider'];
  readonly modelId: LanguageModelV2['modelId'];

  supportsUrl: LanguageModelV2['supportsUrl'];
  doGenerate: LanguageModelV2['doGenerate'];
  doStream: LanguageModelV2['doStream'];

  constructor({
    provider = 'mock-provider',
    modelId = 'mock-model-id',
    supportsUrl = undefined,
    doGenerate = notImplemented,
    doStream = notImplemented,
  }: {
    provider?: LanguageModelV2['provider'];
    modelId?: LanguageModelV2['modelId'];
    supportsUrl?: LanguageModelV2['supportsUrl'];
    doGenerate?: LanguageModelV2['doGenerate'];
    doStream?: LanguageModelV2['doStream'];
  } = {}) {
    this.provider = provider;
    this.modelId = modelId;
    this.doGenerate = doGenerate;
    this.doStream = doStream;
    this.supportsUrl = supportsUrl;
  }
}
