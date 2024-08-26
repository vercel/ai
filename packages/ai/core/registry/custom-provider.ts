import { EmbeddingModelV1, LanguageModelV1 } from '@ai-sdk/provider';
import { Provider } from '../types';
import { NoSuchModelError } from '@ai-sdk/provider';

/**
 * Creates a custom provider with specified language models, text embedding models, and an optional fallback provider.
 *
 * @param {Object} options - The options for creating the custom provider.
 * @param {Record<string, LanguageModelV1>} [options.languageModels] - A record of language models, where keys are model IDs and values are LanguageModelV1 instances.
 * @param {Record<string, EmbeddingModelV1<string>>} [options.textEmbeddingModels] - A record of text embedding models, where keys are model IDs and values are EmbeddingModelV1<string> instances.
 * @param {Provider} [options.fallbackProvider] - An optional fallback provider to use when a requested model is not found in the custom provider.
 * @returns {Provider} A Provider object with languageModel and textEmbeddingModel methods.
 *
 * @throws {NoSuchModelError} Throws when a requested model is not found and no fallback provider is available.
 */
export function experimental_customProvider({
  languageModels,
  textEmbeddingModels,
  fallbackProvider,
}: {
  languageModels?: Record<string, LanguageModelV1>;
  textEmbeddingModels?: Record<string, EmbeddingModelV1<string>>;
  fallbackProvider?: Provider;
}): Provider {
  return {
    languageModel(modelId: string): LanguageModelV1 {
      if (languageModels != null && modelId in languageModels) {
        return languageModels[modelId];
      }

      if (fallbackProvider) {
        return fallbackProvider.languageModel(modelId);
      }

      throw new NoSuchModelError({ modelId, modelType: 'languageModel' });
    },

    textEmbeddingModel(modelId: string): EmbeddingModelV1<string> {
      if (textEmbeddingModels != null && modelId in textEmbeddingModels) {
        return textEmbeddingModels[modelId];
      }

      if (fallbackProvider) {
        return fallbackProvider.textEmbeddingModel(modelId);
      }

      throw new NoSuchModelError({ modelId, modelType: 'textEmbeddingModel' });
    },
  };
}
