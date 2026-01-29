import { VideoModelV3 } from '@ai-sdk/provider';
import { notImplemented } from './not-implemented';

export class MockVideoModelV3 implements VideoModelV3 {
  readonly specificationVersion = 'v3';
  readonly provider: VideoModelV3['provider'];
  readonly modelId: VideoModelV3['modelId'];
  readonly maxVideosPerCall: VideoModelV3['maxVideosPerCall'];

  doGenerate: VideoModelV3['doGenerate'];

  constructor({
    provider = 'mock-provider',
    modelId = 'mock-model-id',
    maxVideosPerCall = 1,
    doGenerate = notImplemented,
  }: {
    provider?: VideoModelV3['provider'];
    modelId?: VideoModelV3['modelId'];
    maxVideosPerCall?: VideoModelV3['maxVideosPerCall'];
    doGenerate?: VideoModelV3['doGenerate'];
  } = {}) {
    this.provider = provider;
    this.modelId = modelId;
    this.maxVideosPerCall = maxVideosPerCall;
    this.doGenerate = doGenerate;
  }
}
