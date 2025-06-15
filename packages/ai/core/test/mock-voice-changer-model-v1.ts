import { VoiceChangerModelV1 } from '@ai-sdk/provider';
import { notImplemented } from './not-implemented';

export class MockVoiceChangerModelV1 implements VoiceChangerModelV1 {
  readonly specificationVersion = 'v1';
  readonly provider: VoiceChangerModelV1['provider'];
  readonly modelId: VoiceChangerModelV1['modelId'];

  doGenerate: VoiceChangerModelV1['doGenerate'];

  constructor({
    provider = 'mock-provider',
    modelId = 'mock-model-id',
    doGenerate = notImplemented,
  }: {
    provider?: VoiceChangerModelV1['provider'];
    modelId?: VoiceChangerModelV1['modelId'];
    doGenerate?: VoiceChangerModelV1['doGenerate'];
  } = {}) {
    this.provider = provider;
    this.modelId = modelId;
    this.doGenerate = doGenerate;
  }
}
