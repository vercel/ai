import type {
  ImageModelV2,
  ImageModelV3,
  ImageModelV4,
} from '@ai-sdk/provider';
import { asImageModelV3 } from './as-image-model-v3';
import { createModelCompatibilityProxy } from './create-model-compatibility-proxy';

export function asImageModelV4(
  model: ImageModelV2 | ImageModelV3 | ImageModelV4,
): ImageModelV4 {
  if (model.specificationVersion === 'v4') {
    return model;
  }

  // first convert v2 to v3, then proxy v3 as v4:
  const v3Model =
    model.specificationVersion === 'v2' ? asImageModelV3(model) : model;

  return createModelCompatibilityProxy(v3Model, 'v4', [
    'doGenerate',
  ]) as unknown as ImageModelV4;
}
