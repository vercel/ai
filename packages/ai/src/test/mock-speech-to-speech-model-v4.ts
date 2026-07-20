import type { Experimental_SpeechToSpeechModelV4 } from '@ai-sdk/provider';
import { notImplemented } from './not-implemented';

export class MockSpeechToSpeechModelV4 implements Experimental_SpeechToSpeechModelV4 {
  readonly specificationVersion = 'v4';
  readonly provider: Experimental_SpeechToSpeechModelV4['provider'];
  readonly modelId: Experimental_SpeechToSpeechModelV4['modelId'];

  doStream: Experimental_SpeechToSpeechModelV4['doStream'];

  constructor({
    provider = 'mock-provider',
    modelId = 'mock-model-id',
    doStream = notImplemented,
  }: {
    provider?: Experimental_SpeechToSpeechModelV4['provider'];
    modelId?: Experimental_SpeechToSpeechModelV4['modelId'];
    doStream?: Experimental_SpeechToSpeechModelV4['doStream'];
  } = {}) {
    this.provider = provider;
    this.modelId = modelId;
    this.doStream = doStream;
  }
}
