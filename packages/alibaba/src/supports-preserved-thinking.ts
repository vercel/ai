import { getAlibabaLanguageModelEntry } from './alibaba-model-catalog';
export function supportsPreservedThinking(modelId: string): boolean {
  return getAlibabaLanguageModelEntry(modelId).capabilities.language.reasoning
    .preserved;
}
