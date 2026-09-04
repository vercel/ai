import type { Experimental_VideoModelV4 } from '@ai-sdk/provider';
import { notImplemented } from './not-implemented';

export class MockVideoModelV4 implements Experimental_VideoModelV4 {
  readonly specificationVersion = 'v4';
  readonly provider: Experimental_VideoModelV4['provider'];
  readonly modelId: Experimental_VideoModelV4['modelId'];
  readonly maxVideosPerCall: Experimental_VideoModelV4['maxVideosPerCall'];

  doGenerate: Experimental_VideoModelV4['doGenerate'];
  handleWebhookOption: Experimental_VideoModelV4['handleWebhookOption'];
  doStart: Experimental_VideoModelV4['doStart'];
  doStatus: Experimental_VideoModelV4['doStatus'];

  constructor(
    options: {
      provider?: Experimental_VideoModelV4['provider'];
      modelId?: Experimental_VideoModelV4['modelId'];
      maxVideosPerCall?: Experimental_VideoModelV4['maxVideosPerCall'];
      doGenerate?: Experimental_VideoModelV4['doGenerate'];
      handleWebhookOption?: Experimental_VideoModelV4['handleWebhookOption'];
      doStart?: Experimental_VideoModelV4['doStart'];
      doStatus?: Experimental_VideoModelV4['doStatus'];
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
