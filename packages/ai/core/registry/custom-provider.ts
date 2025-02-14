import { NoSuchModelError, ProviderV1 } from '@ai-sdk/provider';
import { EmbeddingModel, ImageModel, LanguageModel, Provider } from '../types';

/**
 * Creates a custom provider with specified language models, text embedding models, and an optional fallback provider.
 *
 * @param {Object} options - The options for creating the custom provider.
 * @param {Record<string, LanguageModel>} [options.languageModels] - A record of language models, where keys are model IDs and values are LanguageModel instances.
 * @param {Record<string, EmbeddingModel<string>>} [options.textEmbeddingModels] - A record of text embedding models, where keys are model IDs and values are EmbeddingModel<string> instances.
 * @param {Record<string, ImageModel>} [options.imageModels] - A record of image models, where keys are model IDs and values are ImageModel instances.
 * @param {Provider} [options.fallbackProvider] - An optional fallback provider to use when a requested model is not found in the custom provider.
 * @returns {Provider} A Provider object with languageModel, textEmbeddingModel, and imageModel methods.
 *
 * @throws {NoSuchModelError} Throws when a requested model is not found and no fallback provider is available.
 */
export function customProvider<
  LANGUAGE_MODELS extends Record<string, LanguageModel>,
  EMBEDDING_MODELS extends Record<string, EmbeddingModel<string>>,
  IMAGE_MODELS extends Record<string, ImageModel>,
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
  languageModel(modelId: ExtractModelId<LANGUAGE_MODELS>): LanguageModel;
  textEmbeddingModel(
    modelId: ExtractModelId<EMBEDDING_MODELS>,
  ): EmbeddingModel<string>;
  imageModel(modelId: ExtractModelId<IMAGE_MODELS>): ImageModel;
} {
  return {
    languageModel(modelId: ExtractModelId<LANGUAGE_MODELS>): LanguageModel {
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
    ): EmbeddingModel<string> {
      if (textEmbeddingModels != null && modelId in textEmbeddingModels) {
        return textEmbeddingModels[modelId];
      }

      if (fallbackProvider) {
        return fallbackProvider.textEmbeddingModel(modelId);
      }

      throw new NoSuchModelError({ modelId, modelType: 'textEmbeddingModel' });
    },

    imageModel(modelId: ExtractModelId<IMAGE_MODELS>): ImageModel {
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

/**
 * @deprecated Use `customProvider` instead.
 */
export const experimental_customProvider = customProvider;

type ExtractModelId<MODELS extends Record<string, unknown>> = Extract<
  keyof MODELS,
  string
>;
