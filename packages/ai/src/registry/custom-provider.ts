import {
  EmbeddingModelV3,
  ImageModelV3,
  LanguageModelV3,
  NoSuchModelError,
  ProviderV2,
  ProviderV3,
  SpeechModelV3,
  TranscriptionModelV3,
} from '@ai-sdk/provider';

/**
 * Creates a custom provider with specified language models, text embedding models, image models, transcription models, speech models, and an optional fallback provider.
 *
 * @param {Object} options - The options for creating the custom provider.
 * @param {Record<string, LanguageModel>} [options.languageModels] - A record of language models, where keys are model IDs and values are LanguageModel instances.
 * @param {Record<string, EmbeddingModel<string>>} [options.textEmbeddingModels] - A record of text embedding models, where keys are model IDs and values are EmbeddingModel<string> instances.
 * @param {Record<string, ImageModel>} [options.imageModels] - A record of image models, where keys are model IDs and values are ImageModel instances.
 * @param {Record<string, TranscriptionModel>} [options.transcriptionModels] - A record of transcription models, where keys are model IDs and values are TranscriptionModel instances.
 * @param {Record<string, SpeechModel>} [options.speechModels] - A record of speech models, where keys are model IDs and values are SpeechModel instances.
 * @param {Provider} [options.fallbackProvider] - An optional fallback provider to use when a requested model is not found in the custom provider.
 * @returns {Provider} A Provider object with languageModel, textEmbeddingModel, imageModel, transcriptionModel, and speechModel methods.
 *
 * @throws {NoSuchModelError} Throws when a requested model is not found and no fallback provider is available.
 */
export function customProvider<
  LANGUAGE_MODELS extends Record<string, LanguageModelV3>,
  EMBEDDING_MODELS extends Record<string, EmbeddingModelV3<string>>,
  IMAGE_MODELS extends Record<string, ImageModelV3>,
  TRANSCRIPTION_MODELS extends Record<string, TranscriptionModelV3>,
  SPEECH_MODELS extends Record<string, SpeechModelV3>,
>({
  languageModels,
  textEmbeddingModels,
  imageModels,
  transcriptionModels,
  speechModels,
  fallbackProvider,
}: {
  languageModels?: LANGUAGE_MODELS;
  textEmbeddingModels?: EMBEDDING_MODELS;
  imageModels?: IMAGE_MODELS;
  transcriptionModels?: TRANSCRIPTION_MODELS;
  speechModels?: SPEECH_MODELS;
  fallbackProvider?: ProviderV3 | ProviderV2;
}): ProviderV3 & {
  languageModel(modelId: ExtractModelId<LANGUAGE_MODELS>): LanguageModelV3;
  textEmbeddingModel(
    modelId: ExtractModelId<EMBEDDING_MODELS>,
  ): EmbeddingModelV3<string>;
  imageModel(modelId: ExtractModelId<IMAGE_MODELS>): ImageModelV3;
  transcriptionModel(
    modelId: ExtractModelId<TRANSCRIPTION_MODELS>,
  ): TranscriptionModelV3;
  speechModel(modelId: ExtractModelId<SPEECH_MODELS>): SpeechModelV3;
} {
  return {
    languageModel(modelId: ExtractModelId<LANGUAGE_MODELS>): LanguageModelV3 {
      if (languageModels != null && modelId in languageModels) {
        return languageModels[modelId];
      }

      if (fallbackProvider) {
        return (fallbackProvider as ProviderV3).languageModel(modelId);
      }

      throw new NoSuchModelError({ modelId, modelType: 'languageModel' });
    },

    textEmbeddingModel(
      modelId: ExtractModelId<EMBEDDING_MODELS>,
    ): EmbeddingModelV3<string> {
      if (textEmbeddingModels != null && modelId in textEmbeddingModels) {
        return textEmbeddingModels[modelId];
      }

      if (fallbackProvider) {
        return (fallbackProvider as ProviderV3).textEmbeddingModel(modelId);
      }

      throw new NoSuchModelError({ modelId, modelType: 'textEmbeddingModel' });
    },

    imageModel(modelId: ExtractModelId<IMAGE_MODELS>): ImageModelV3 {
      if (imageModels != null && modelId in imageModels) {
        return imageModels[modelId];
      }

      if (fallbackProvider?.imageModel) {
        return (fallbackProvider as ProviderV3).imageModel(modelId);
      }

      throw new NoSuchModelError({ modelId, modelType: 'imageModel' });
    },

    transcriptionModel(
      modelId: ExtractModelId<TRANSCRIPTION_MODELS>,
    ): TranscriptionModelV3 {
      if (transcriptionModels != null && modelId in transcriptionModels) {
        return transcriptionModels[modelId];
      }

      if (fallbackProvider?.transcriptionModel) {
        return (fallbackProvider as ProviderV3).transcriptionModel!(modelId);
      }

      throw new NoSuchModelError({ modelId, modelType: 'transcriptionModel' });
    },

    speechModel(modelId: ExtractModelId<SPEECH_MODELS>): SpeechModelV3 {
      if (speechModels != null && modelId in speechModels) {
        return speechModels[modelId];
      }

      if (fallbackProvider?.speechModel) {
        return (fallbackProvider as ProviderV3).speechModel!(modelId);
      }

      throw new NoSuchModelError({ modelId, modelType: 'speechModel' });
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
