import { getGoogleLanguageModelEntry } from './google-model-catalog';

/** Compatibility projection of the resolved catalog for existing request code. */
export function getGoogleModelCapabilities(modelId: string) {
  const { tools } = getGoogleLanguageModelEntry(modelId).capabilities.language;
  return {
    supportsGemini2Tools: tools.gemini2,
    supportsFileSearch: tools.fileSearch,
    usesGemini3Features: tools.mixed,
  };
}
