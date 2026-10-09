import type { Experimental_SpeechTranslationModelV4 } from '@ai-sdk/provider';
import { notImplemented } from './not-implemented';

export class MockSpeechTranslationModelV4 implements Experimental_SpeechTranslationModelV4 {
  readonly specificationVersion = 'v4';
  readonly provider: Experimental_SpeechTranslationModelV4['provider'];
  readonly modelId: Experimental_SpeechTranslationModelV4['modelId'];

  doStream: Experimental_SpeechTranslationModelV4['doStream'];

  constructor({
    provider = 'mock-provider',
    modelId = 'mock-model-id',
    doStream = notImplemented,
  }: {
    provider?: Experimental_SpeechTranslationModelV4['provider'];
    modelId?: Experimental_SpeechTranslationModelV4['modelId'];
    doStream?: Experimental_SpeechTranslationModelV4['doStream'];
  } = {}) {
    this.provider = provider;
    this.modelId = modelId;
    this.doStream = doStream;
  }
}
