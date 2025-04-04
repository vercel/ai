import { LanguageModelV2 } from '@ai-sdk/provider';
import { notImplemented } from './not-implemented';

export class MockLanguageModelV2 implements LanguageModelV2 {
  readonly specificationVersion = 'v2';

  readonly provider: LanguageModelV2['provider'];
  readonly modelId: LanguageModelV2['modelId'];

  supportsUrl: LanguageModelV2['supportsUrl'];
  doGenerate: LanguageModelV2['doGenerate'];
  doStream: LanguageModelV2['doStream'];

  readonly defaultObjectGenerationMode: LanguageModelV2['defaultObjectGenerationMode'];
  readonly supportsStructuredOutputs: LanguageModelV2['supportsStructuredOutputs'];
  constructor({
    provider = 'mock-provider',
    modelId = 'mock-model-id',
    supportsUrl = undefined,
    doGenerate = notImplemented,
    doStream = notImplemented,
    defaultObjectGenerationMode = undefined,
    supportsStructuredOutputs = undefined,
  }: {
    provider?: LanguageModelV2['provider'];
    modelId?: LanguageModelV2['modelId'];
    supportsUrl?: LanguageModelV2['supportsUrl'];
    doGenerate?: LanguageModelV2['doGenerate'];
    doStream?: LanguageModelV2['doStream'];
    defaultObjectGenerationMode?: LanguageModelV2['defaultObjectGenerationMode'];
    supportsStructuredOutputs?: LanguageModelV2['supportsStructuredOutputs'];
  } = {}) {
    this.provider = provider;
    this.modelId = modelId;
    this.doGenerate = doGenerate;
    this.doStream = doStream;
    this.supportsUrl = supportsUrl;

    this.defaultObjectGenerationMode = defaultObjectGenerationMode;
    this.supportsStructuredOutputs = supportsStructuredOutputs;
  }
}
