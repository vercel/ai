import { Experimental_VideoModelV3 } from '@ai-sdk/provider';
import { notImplemented } from './not-implemented';

export class MockVideoModelV3 implements Experimental_VideoModelV3 {
  readonly specificationVersion = 'v3';
  readonly provider: Experimental_VideoModelV3['provider'];
  readonly modelId: Experimental_VideoModelV3['modelId'];
  readonly maxVideosPerCall: Experimental_VideoModelV3['maxVideosPerCall'];

  doGenerate: Experimental_VideoModelV3['doGenerate'];
  handleWebhookOption: Experimental_VideoModelV3['handleWebhookOption'];
  doStart: Experimental_VideoModelV3['doStart'];
  doStatus: Experimental_VideoModelV3['doStatus'];

  constructor(
    options: {
      provider?: Experimental_VideoModelV3['provider'];
      modelId?: Experimental_VideoModelV3['modelId'];
      maxVideosPerCall?: Experimental_VideoModelV3['maxVideosPerCall'];
      doGenerate?: Experimental_VideoModelV3['doGenerate'];
      handleWebhookOption?: Experimental_VideoModelV3['handleWebhookOption'];
      doStart?: Experimental_VideoModelV3['doStart'];
      doStatus?: Experimental_VideoModelV3['doStatus'];
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
