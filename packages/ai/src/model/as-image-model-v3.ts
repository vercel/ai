import type { ImageModelV2, ImageModelV3 } from '@ai-sdk/provider';
import { logV2CompatibilityWarning } from '../util/log-v2-compatibility-warning';
import { createModelCompatibilityProxy } from './create-model-compatibility-proxy';

export function asImageModelV3(
  model: ImageModelV2 | ImageModelV3,
): ImageModelV3 {
  if (model.specificationVersion === 'v3') {
    return model;
  }

  logV2CompatibilityWarning({
    provider: model.provider,
    modelId: model.modelId,
  });

  // TODO this could break, we need to properly map v2 to v3
  // and support all relevant v3 properties:
  return createModelCompatibilityProxy(model, 'v3', [
    'doGenerate',
  ]) as unknown as ImageModelV3;
}
