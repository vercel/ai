import { gateway } from '@ai-sdk/gateway';
import {
  EmbeddingModelV2,
  EmbeddingModelV3,
  LanguageModelV2,
  LanguageModelV3,
  ProviderV3,
} from '@ai-sdk/provider';
import { UnsupportedModelVersionError } from '../error';
import { EmbeddingModel } from '../types/embedding-model';
import { LanguageModel } from '../types/language-model';

function transformToV3LanguageModel(model: LanguageModelV2): LanguageModelV3 {
  return {
    ...model,
    specificationVersion: 'v3',
  };
}

function transformToV3EmbeddingModel<VALUE>(
  model: EmbeddingModelV2<VALUE>,
): EmbeddingModelV3<VALUE> {
  return {
    ...model,
    specificationVersion: 'v3',
  };
}

export function resolveLanguageModel(model: LanguageModel): LanguageModelV3 {
  if (typeof model !== 'string') {
    if (
      model.specificationVersion !== 'v3' &&
      model.specificationVersion !== 'v2'
    ) {
      const unsupportedModel: any = model;
      throw new UnsupportedModelVersionError({
        version: unsupportedModel.specificationVersion,
        provider: unsupportedModel.provider,
        modelId: unsupportedModel.modelId,
      });
    }
    if (model.specificationVersion === 'v2') {
      return transformToV3LanguageModel(model);
    }
    return model;
  }

  return getGlobalProvider().languageModel(model);
}

export function resolveEmbeddingModel<VALUE = string>(
  model: EmbeddingModel<VALUE>,
): EmbeddingModelV3<VALUE> {
  if (typeof model !== 'string') {
    if (
      model.specificationVersion !== 'v3' &&
      model.specificationVersion !== 'v2'
    ) {
      const unsupportedModel: any = model;
      throw new UnsupportedModelVersionError({
        version: unsupportedModel.specificationVersion,
        provider: unsupportedModel.provider,
        modelId: unsupportedModel.modelId,
      });
    }
    if (model.specificationVersion === 'v2') {
      return transformToV3EmbeddingModel(model);
    }

    return model;
  }

  // TODO AI SDK 6: figure out how to cleanly support different generic types
  return getGlobalProvider().textEmbeddingModel(
    model,
  ) as EmbeddingModelV3<VALUE>;
}

function getGlobalProvider(): ProviderV3 {
  return globalThis.AI_SDK_DEFAULT_PROVIDER ?? gateway;
}
