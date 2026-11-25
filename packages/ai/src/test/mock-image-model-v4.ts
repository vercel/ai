import type { ImageModelV4 } from '@ai-sdk/provider';
import { notImplemented } from './not-implemented';

export class MockImageModelV4 implements ImageModelV4 {
  readonly specificationVersion = 'v4';
  readonly provider: ImageModelV4['provider'];
  readonly modelId: ImageModelV4['modelId'];
  readonly maxImagesPerCall: ImageModelV4['maxImagesPerCall'];
  readonly supportsFileInputs: ImageModelV4['supportsFileInputs'];
  readonly supportsMaskInputs: ImageModelV4['supportsMaskInputs'];

  doGenerate: ImageModelV4['doGenerate'];

  constructor({
    provider = 'mock-provider',
    modelId = 'mock-model-id',
    maxImagesPerCall = 1,
    supportsFileInputs,
    supportsMaskInputs,
    doGenerate = notImplemented,
  }: {
    provider?: ImageModelV4['provider'];
    modelId?: ImageModelV4['modelId'];
    maxImagesPerCall?: ImageModelV4['maxImagesPerCall'];
    supportsFileInputs?: ImageModelV4['supportsFileInputs'];
    supportsMaskInputs?: ImageModelV4['supportsMaskInputs'];
    doGenerate?: ImageModelV4['doGenerate'];
  } = {}) {
    this.provider = provider;
    this.modelId = modelId;
    this.maxImagesPerCall = maxImagesPerCall;
    this.supportsFileInputs = supportsFileInputs;
    this.supportsMaskInputs = supportsMaskInputs;
    this.doGenerate = doGenerate;
  }
}
