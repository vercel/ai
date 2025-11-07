import { EmbeddingModelV2, EmbeddingModelV3 } from '@ai-sdk/provider';

export function asEmbeddingModelV3<VALUE>(
  model: EmbeddingModelV2<VALUE> | EmbeddingModelV3<VALUE>,
): EmbeddingModelV3<VALUE> {
  if (model.specificationVersion === 'v3') {
    return model;
  }

  // TODO this could break, we need to properly map v2 to v3
  // and support all relevant v3 properties:
  return new Proxy(model, {
    get(target, prop: keyof EmbeddingModelV2<VALUE>) {
      if (prop === 'specificationVersion') return 'v3';
      return target[prop];
    },
  }) as unknown as EmbeddingModelV3<VALUE>;
}
