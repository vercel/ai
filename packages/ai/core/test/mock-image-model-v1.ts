import { ImageModelV1 } from '@ai-sdk/provider';
import { notImplemented } from './not-implemented';

export class MockImageModelV1 implements ImageModelV1 {
  readonly specificationVersion = 'v1';

  readonly provider: ImageModelV1['provider'];
  readonly modelId: ImageModelV1['modelId'];

  doGenerate: ImageModelV1['doGenerate'];

  constructor({
    provider = 'mock-provider',
    modelId = 'mock-model-id',
    doGenerate = notImplemented,
  }: {
    provider?: ImageModelV1['provider'];
    modelId?: ImageModelV1['modelId'];
    doGenerate?: ImageModelV1['doGenerate'];
  } = {}) {
    this.provider = provider;
    this.modelId = modelId;
    this.doGenerate = doGenerate;
  }
}
