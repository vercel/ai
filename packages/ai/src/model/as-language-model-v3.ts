import { LanguageModelV2, LanguageModelV3 } from '@ai-sdk/provider';

export function asLanguageModelV3(
  model: LanguageModelV2 | LanguageModelV3,
): LanguageModelV3 {
  if (model.specificationVersion === 'v3') {
    return model;
  }

  // TODO this could break, we need to properly map v2 to v3
  // and support all relevant v3 properties:
  return new Proxy(model, {
    get(target, prop: keyof LanguageModelV2) {
      if (prop === 'specificationVersion') return 'v3';
      return target[prop];
    },
  }) as unknown as LanguageModelV3;
}
