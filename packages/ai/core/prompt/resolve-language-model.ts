import { gateway } from '@ai-sdk/gateway';
import { LanguageModelV2 } from '@ai-sdk/provider';
import { LanguageModel } from '../types/language-model';

export function resolveLanguageModel(model: LanguageModel): LanguageModelV2 {
  return typeof model === 'string' ? gateway.languageModel(model) : model;
}
