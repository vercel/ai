import { TranscriptionModelV1 } from '@ai-sdk/provider';
import { notImplemented } from './not-implemented';

export class MockTranscriptionModelV1 implements TranscriptionModelV1 {
  readonly specificationVersion = 'v1';
  readonly provider: TranscriptionModelV1['provider'];
  readonly modelId: TranscriptionModelV1['modelId'];

  doGenerate: TranscriptionModelV1['doGenerate'];

  constructor({
    provider = 'mock-provider',
    modelId = 'mock-model-id',
    doGenerate = notImplemented,
  }: {
    provider?: TranscriptionModelV1['provider'];
    modelId?: TranscriptionModelV1['modelId'];
    doGenerate?: TranscriptionModelV1['doGenerate'];
  } = {}) {
    this.provider = provider;
    this.modelId = modelId;
    this.doGenerate = doGenerate;
  }
}
