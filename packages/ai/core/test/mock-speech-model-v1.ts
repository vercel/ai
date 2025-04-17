import { SpeechModelV1 } from '@ai-sdk/provider';
import { notImplemented } from './not-implemented';

export class MockSpeechModelV1 implements SpeechModelV1 {
  readonly specificationVersion = 'v1';
  readonly provider: SpeechModelV1['provider'];
  readonly modelId: SpeechModelV1['modelId'];

  doGenerate: SpeechModelV1['doGenerate'];

  constructor({
    provider = 'mock-provider',
    modelId = 'mock-model-id',
    doGenerate = notImplemented,
  }: {
    provider?: SpeechModelV1['provider'];
    modelId?: SpeechModelV1['modelId'];
    doGenerate?: SpeechModelV1['doGenerate'];
  } = {}) {
    this.provider = provider;
    this.modelId = modelId;
    this.doGenerate = doGenerate;
  }
}
