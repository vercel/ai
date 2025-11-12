import { ImageModelV2, ImageModelV3 } from '@ai-sdk/provider';

export function asImageModelV3(
  model: ImageModelV2 | ImageModelV3,
): ImageModelV3 {
  if (model.specificationVersion === 'v3') {
    return model;
  }

  // TODO this could break, we need to properly map v2 to v3
  // and support all relevant v3 properties:
  return new Proxy(model, {
    get(target, prop: keyof ImageModelV2) {
      if (prop === 'specificationVersion') return 'v3';
      return target[prop];
    },
  }) as unknown as ImageModelV3;
}
