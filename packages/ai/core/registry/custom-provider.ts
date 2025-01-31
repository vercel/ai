import {
  EmbeddingModelV1,
  LanguageModelV1,
  ImageModelV1,
  ProviderV1,
} from '@ai-sdk/provider';
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
export function experimental_customProvider<
  LANGUAGE_MODELS extends Record<string, LanguageModelV1>,
  EMBEDDING_MODELS extends Record<string, EmbeddingModelV1<string>>,
  IMAGE_MODELS extends Record<string, ImageModelV1>,
>({
  languageModels,
  textEmbeddingModels,
  imageModels,
  fallbackProvider,
}: {
  languageModels?: LANGUAGE_MODELS;
  textEmbeddingModels?: EMBEDDING_MODELS;
  imageModels?: IMAGE_MODELS;
  fallbackProvider?: ProviderV1;
}): Provider & {
  languageModel(modelId: ExtractModelId<LANGUAGE_MODELS>): LanguageModelV1;
  textEmbeddingModel(
    modelId: ExtractModelId<EMBEDDING_MODELS>,
  ): EmbeddingModelV1<string>;
  imageModel(modelId: ExtractModelId<IMAGE_MODELS>): ImageModelV1;
} {
  return {
    languageModel(modelId: ExtractModelId<LANGUAGE_MODELS>): LanguageModelV1 {
      if (languageModels != null && modelId in languageModels) {
        return languageModels[modelId];
      }

      if (fallbackProvider) {
        return fallbackProvider.languageModel(modelId);
      }

      throw new NoSuchModelError({ modelId, modelType: 'languageModel' });
    },

    textEmbeddingModel(
      modelId: ExtractModelId<EMBEDDING_MODELS>,
    ): EmbeddingModelV1<string> {
      if (textEmbeddingModels != null && modelId in textEmbeddingModels) {
        return textEmbeddingModels[modelId];
      }

      if (fallbackProvider) {
        return fallbackProvider.textEmbeddingModel(modelId);
      }

      throw new NoSuchModelError({ modelId, modelType: 'textEmbeddingModel' });
    },

    imageModel(modelId: ExtractModelId<IMAGE_MODELS>): ImageModelV1 {
      if (imageModels != null && modelId in imageModels) {
        return imageModels[modelId];
      }

      if (fallbackProvider?.imageModel) {
        return fallbackProvider.imageModel(modelId);
      }

      throw new NoSuchModelError({ modelId, modelType: 'imageModel' });
    },
  };
}

type ExtractModelId<MODELS extends Record<string, unknown>> = Extract<
  keyof MODELS,
  string
>;
