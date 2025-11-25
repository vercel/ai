import {
  EmbeddingModelV3,
  ImageModelV3,
  LanguageModelV3,
  NoSuchModelError,
  ProviderV2,
  ProviderV3,
  RerankingModelV3,
  SpeechModelV3,
  TranscriptionModelV3,
} from '@ai-sdk/provider';
import { asProviderV3 } from '../model/as-provider-v3';

/**
 * Creates a custom provider with specified language models, text embedding models, image models, transcription models, speech models, and an optional fallback provider.
 *
 * @param {Object} options - The options for creating the custom provider.
 * @param {Record<string, LanguageModel>} [options.languageModels] - A record of language models, where keys are model IDs and values are LanguageModel instances.
 * @param {Record<string, EmbeddingModel>} [options.embeddingModels] - A record of text embedding models, where keys are model IDs and values are EmbeddingModel instances.
 * @param {Record<string, ImageModel>} [options.imageModels] - A record of image models, where keys are model IDs and values are ImageModel instances.
 * @param {Record<string, TranscriptionModel>} [options.transcriptionModels] - A record of transcription models, where keys are model IDs and values are TranscriptionModel instances.
 * @param {Record<string, SpeechModel>} [options.speechModels] - A record of speech models, where keys are model IDs and values are SpeechModel instances.
 * @param {Record<string, RerankingModel>} [options.rerankingModels] - A record of reranking models, where keys are model IDs and values are RerankingModel instances.
 * @param {Provider} [options.fallbackProvider] - An optional fallback provider to use when a requested model is not found in the custom provider.
 * @returns {Provider} A Provider object with languageModel, embeddingModel, imageModel, transcriptionModel, and speechModel methods.
 *
 * @throws {NoSuchModelError} Throws when a requested model is not found and no fallback provider is available.
 */
export function customProvider<
  LANGUAGE_MODELS extends Record<string, LanguageModelV3>,
  EMBEDDING_MODELS extends Record<string, EmbeddingModelV3>,
  IMAGE_MODELS extends Record<string, ImageModelV3>,
  TRANSCRIPTION_MODELS extends Record<string, TranscriptionModelV3>,
  SPEECH_MODELS extends Record<string, SpeechModelV3>,
  RERANKING_MODELS extends Record<string, RerankingModelV3>,
>({
  languageModels,
  embeddingModels,
  imageModels,
  transcriptionModels,
  speechModels,
  rerankingModels,
  fallbackProvider: fallbackProviderArg,
}: {
  languageModels?: LANGUAGE_MODELS;
  embeddingModels?: EMBEDDING_MODELS;
  imageModels?: IMAGE_MODELS;
  transcriptionModels?: TRANSCRIPTION_MODELS;
  speechModels?: SPEECH_MODELS;
  rerankingModels?: RERANKING_MODELS;
  fallbackProvider?: ProviderV3 | ProviderV2;
}): ProviderV3 & {
  languageModel(modelId: ExtractModelId<LANGUAGE_MODELS>): LanguageModelV3;
  embeddingModel(modelId: ExtractModelId<EMBEDDING_MODELS>): EmbeddingModelV3;
  imageModel(modelId: ExtractModelId<IMAGE_MODELS>): ImageModelV3;
  transcriptionModel(
    modelId: ExtractModelId<TRANSCRIPTION_MODELS>,
  ): TranscriptionModelV3;
  rerankingModel(modelId: ExtractModelId<RERANKING_MODELS>): RerankingModelV3;
  speechModel(modelId: ExtractModelId<SPEECH_MODELS>): SpeechModelV3;
} {
  const fallbackProvider = fallbackProviderArg
    ? asProviderV3(fallbackProviderArg)
    : undefined;

  return {
    specificationVersion: 'v3',
    languageModel(modelId: ExtractModelId<LANGUAGE_MODELS>): LanguageModelV3 {
      if (languageModels != null && modelId in languageModels) {
        return languageModels[modelId];
      }

      if (fallbackProvider) {
        return (fallbackProvider as ProviderV3).languageModel(modelId);
      }

      throw new NoSuchModelError({ modelId, modelType: 'languageModel' });
    },

    embeddingModel(
      modelId: ExtractModelId<EMBEDDING_MODELS>,
    ): EmbeddingModelV3 {
      if (embeddingModels != null && modelId in embeddingModels) {
        return embeddingModels[modelId];
      }

      if (fallbackProvider) {
        return (fallbackProvider as ProviderV3).embeddingModel(modelId);
      }

      throw new NoSuchModelError({ modelId, modelType: 'embeddingModel' });
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
    rerankingModel(
      modelId: ExtractModelId<RERANKING_MODELS>,
    ): RerankingModelV3 {
      if (rerankingModels != null && modelId in rerankingModels) {
        return rerankingModels[modelId];
      }

      if (fallbackProvider?.rerankingModel) {
        return fallbackProvider.rerankingModel(modelId);
      }

      throw new NoSuchModelError({ modelId, modelType: 'rerankingModel' });
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
