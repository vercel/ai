import { gateway } from '@ai-sdk/gateway';
import { LanguageModelV2, ProviderV2 } from '@ai-sdk/provider';
import { LanguageModel } from '../types/language-model';

export const GLOBAL_DEFAULT_PROVIDER = Symbol(
  'vercel.ai.global.defaultProvider',
);

export function resolveLanguageModel(model: LanguageModel): LanguageModelV2 {
  if (typeof model !== 'string') {
    return model;
  }

  const globalProvider = (globalThis as any)[GLOBAL_DEFAULT_PROVIDER] as
    | ProviderV2
    | undefined;

  return (globalProvider ?? gateway).languageModel(model);
}
