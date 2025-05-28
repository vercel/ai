import {
  EmbeddingModelV2,
  ImageModelV2,
  LanguageModelV2,
  NoSuchModelError,
  ProviderV2,
} from '@ai-sdk/provider';

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
  LANGUAGE_MODELS extends Record<string, LanguageModelV2>,
  EMBEDDING_MODELS extends Record<string, EmbeddingModelV2<string>>,
  IMAGE_MODELS extends Record<string, ImageModelV2>,
>({
  languageModels,
  textEmbeddingModels,
  imageModels,
  fallbackProvider,
}: {
  languageModels?: LANGUAGE_MODELS;
  textEmbeddingModels?: EMBEDDING_MODELS;
  imageModels?: IMAGE_MODELS;
  fallbackProvider?: ProviderV2;
}): ProviderV2 & {
  languageModel(modelId: ExtractModelId<LANGUAGE_MODELS>): LanguageModelV2;
  textEmbeddingModel(
    modelId: ExtractModelId<EMBEDDING_MODELS>,
  ): EmbeddingModelV2<string>;
  imageModel(modelId: ExtractModelId<IMAGE_MODELS>): ImageModelV2;
} {
  return {
    languageModel(modelId: ExtractModelId<LANGUAGE_MODELS>): LanguageModelV2 {
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
    ): EmbeddingModelV2<string> {
      if (textEmbeddingModels != null && modelId in textEmbeddingModels) {
        return textEmbeddingModels[modelId];
      }

      if (fallbackProvider) {
        return fallbackProvider.textEmbeddingModel(modelId);
      }

      throw new NoSuchModelError({ modelId, modelType: 'textEmbeddingModel' });
    },

    imageModel(modelId: ExtractModelId<IMAGE_MODELS>): ImageModelV2 {
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
