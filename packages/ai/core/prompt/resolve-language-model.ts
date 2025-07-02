import { gateway } from '@ai-sdk/gateway';
import { LanguageModelV2 } from '@ai-sdk/provider';
import { LanguageModel } from '../types/language-model';

export function resolveLanguageModel(model: LanguageModel): LanguageModelV2 {
  if (typeof model !== 'string') {
    return model;
  }

  const globalProvider = globalThis.AI_SDK_DEFAULT_PROVIDER;
  return (globalProvider ?? gateway).languageModel(model);
}
