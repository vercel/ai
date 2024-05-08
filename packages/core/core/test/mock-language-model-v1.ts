import { LanguageModelV1 } from '@ai-sdk/provider';

export class MockLanguageModelV1 implements LanguageModelV1 {
  readonly specificationVersion = 'v1';

  readonly provider: LanguageModelV1['provider'];
  readonly modelId: LanguageModelV1['modelId'];

  doGenerate: LanguageModelV1['doGenerate'];
  doStream: LanguageModelV1['doStream'];

  readonly defaultObjectGenerationMode: LanguageModelV1['defaultObjectGenerationMode'];

  constructor({
    provider = 'mock-provider',
    modelId = 'mock-model-id',
    doGenerate = notImplemented,
    doStream = notImplemented,
    defaultObjectGenerationMode = undefined,
  }: {
    provider?: LanguageModelV1['provider'];
    modelId?: LanguageModelV1['modelId'];
    doGenerate?: LanguageModelV1['doGenerate'];
    doStream?: LanguageModelV1['doStream'];
    defaultObjectGenerationMode?: LanguageModelV1['defaultObjectGenerationMode'];
  }) {
    this.provider = provider;
    this.modelId = modelId;
    this.doGenerate = doGenerate;
    this.doStream = doStream;

    this.defaultObjectGenerationMode = defaultObjectGenerationMode;
  }
}

function notImplemented(): never {
  throw new Error('Not implemented');
}
