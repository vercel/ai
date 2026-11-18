import type { Experimental_StreamingSpeechModelV4 } from '@ai-sdk/provider';
import { notImplemented } from './not-implemented';

export class MockStreamingSpeechModelV4 implements Experimental_StreamingSpeechModelV4 {
  readonly specificationVersion = 'v4';
  readonly provider: Experimental_StreamingSpeechModelV4['provider'];
  readonly modelId: Experimental_StreamingSpeechModelV4['modelId'];

  doGenerate: Experimental_StreamingSpeechModelV4['doGenerate'];
  doStream: Experimental_StreamingSpeechModelV4['doStream'];

  constructor({
    provider = 'mock-provider',
    modelId = 'mock-model-id',
    doGenerate = notImplemented,
    doStream = notImplemented,
  }: {
    provider?: Experimental_StreamingSpeechModelV4['provider'];
    modelId?: Experimental_StreamingSpeechModelV4['modelId'];
    doGenerate?: Experimental_StreamingSpeechModelV4['doGenerate'];
    doStream?: Experimental_StreamingSpeechModelV4['doStream'];
  } = {}) {
    this.provider = provider;
    this.modelId = modelId;
    this.doGenerate = doGenerate;
    this.doStream = doStream;
  }
}
