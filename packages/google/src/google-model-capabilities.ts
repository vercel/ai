import { getGoogleLanguageModelEntry } from './google-model-catalog';

/** Tool capabilities of a model ID, as declared in the model catalog. */
export function getGoogleModelCapabilities(modelId: string) {
  const { tools } = getGoogleLanguageModelEntry(modelId).capabilities.language;
  return {
    supportsProviderTools: tools.providerTools,
    supportsFileSearch: tools.fileSearch,
    supportsMixedTools: tools.mixed,
  };
}
