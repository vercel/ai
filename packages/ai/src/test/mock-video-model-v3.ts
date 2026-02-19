import { Experimental_VideoModelV3 as VideoModelV3 } from '@ai-sdk/provider';
import { notImplemented } from './not-implemented';

export class MockVideoModelV3 implements VideoModelV3 {
  readonly specificationVersion = 'v3';
  readonly provider: VideoModelV3['provider'];
  readonly modelId: VideoModelV3['modelId'];
  readonly maxVideosPerCall: VideoModelV3['maxVideosPerCall'];

  doGenerate: VideoModelV3['doGenerate'];
  handleWebhookOption: VideoModelV3['handleWebhookOption'];
  doStart: VideoModelV3['doStart'];
  doStatus: VideoModelV3['doStatus'];

  constructor(
    options: {
      provider?: VideoModelV3['provider'];
      modelId?: VideoModelV3['modelId'];
      maxVideosPerCall?: VideoModelV3['maxVideosPerCall'];
      doGenerate?: VideoModelV3['doGenerate'];
      handleWebhookOption?: VideoModelV3['handleWebhookOption'];
      doStart?: VideoModelV3['doStart'];
      doStatus?: VideoModelV3['doStatus'];
    } = {},
  ) {
    this.provider = options.provider ?? 'mock-provider';
    this.modelId = options.modelId ?? 'mock-model-id';
    this.maxVideosPerCall = options.maxVideosPerCall ?? 1;
    this.doGenerate =
      'doGenerate' in options ? options.doGenerate : notImplemented;
    this.handleWebhookOption = options.handleWebhookOption;
    this.doStart = options.doStart;
    this.doStatus = options.doStatus;
  }
}
