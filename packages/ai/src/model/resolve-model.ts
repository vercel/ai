import { gateway } from '@ai-sdk/gateway';
import type {
  EmbeddingModelV2,
  ImageModelV2,
  LanguageModelV2,
  ProviderV2,
} from '@ai-sdk/provider';
import { UnsupportedModelVersionError } from '../error';
import type { EmbeddingModel } from '../types/embedding-model';
import type { LanguageModel } from '../types/language-model';
import type { ImageModel } from '../types/image-model';

export function resolveLanguageModel(model: LanguageModel): LanguageModelV2 {
  if (typeof model !== 'string') {
    if (model.specificationVersion !== 'v2') {
      throw new UnsupportedModelVersionError({
        version: model.specificationVersion,
        provider: model.provider,
        modelId: model.modelId,
      });
    }

    return model;
  }

  return getGlobalProvider().languageModel(model);
}

export function resolveEmbeddingModel<VALUE = string>(
  model: EmbeddingModel<VALUE>,
): EmbeddingModelV2<VALUE> {
  if (typeof model !== 'string') {
    if (model.specificationVersion !== 'v2') {
      throw new UnsupportedModelVersionError({
        version: model.specificationVersion,
        provider: model.provider,
        modelId: model.modelId,
      });
    }

    return model;
  }

  // TODO AI SDK 6: figure out how to cleanly support different generic types
  return getGlobalProvider().textEmbeddingModel(
    model,
  ) as EmbeddingModelV2<VALUE>;
}

export function resolveImageModel(model: ImageModel): ImageModelV2 {
  if (typeof model !== 'string') {
    if (model.specificationVersion !== 'v2') {
      throw new UnsupportedModelVersionError({
        version: model.specificationVersion,
        provider: model.provider,
        modelId: model.modelId,
      });
    }

    return model;
  }

  return getGlobalProvider().imageModel(model);
}

function getGlobalProvider(): ProviderV2 {
  return globalThis.AI_SDK_DEFAULT_PROVIDER ?? gateway;
}
