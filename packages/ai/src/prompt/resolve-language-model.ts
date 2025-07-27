import { gateway } from '@ai-sdk/gateway';
import { LanguageModelV2 } from '@ai-sdk/provider';
import { UnsupportedModelVersionError } from '../error';
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

  const globalProvider = globalThis.AI_SDK_DEFAULT_PROVIDER;
  return (globalProvider ?? gateway).languageModel(model);
}
