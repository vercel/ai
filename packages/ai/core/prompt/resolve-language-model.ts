import { gateway } from '@ai-sdk/gateway';
import { LanguageModelV2, ProviderV2 } from '@ai-sdk/provider';
import { LanguageModel } from '../types/language-model';

// add type of the global default provider variable to the globalThis object
declare global {
  var VERCEL_AI_GLOBAL_DEFAULT_PROVIDER: ProviderV2 | undefined;
}

export function resolveLanguageModel(model: LanguageModel): LanguageModelV2 {
  if (typeof model !== 'string') {
    return model;
  }

  const globalProvider = globalThis.VERCEL_AI_GLOBAL_DEFAULT_PROVIDER;
  return (globalProvider ?? gateway).languageModel(model);
}
