import { gateway } from '@ai-sdk/gateway';
import {
  EmbeddingModelV2,
  LanguageModelV2,
  ProviderV2,
} from '@ai-sdk/provider';
import { UnsupportedModelVersionError } from '../error';
import { EmbeddingModel } from '../types/embedding-model';
import { LanguageModel } from '../types/language-model';

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

function getGlobalProvider(): ProviderV2 {
  return globalThis.AI_SDK_DEFAULT_PROVIDER ?? gateway;
}
