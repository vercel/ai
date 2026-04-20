import {
  EmbeddingModelV3,
  EmbeddingModelV4,
  Experimental_VideoModelV3,
  Experimental_VideoModelV4,
  FilesV4,
  ImageModelV2,
  ImageModelV3,
  ImageModelV4,
  LanguageModelV2,
  LanguageModelV3,
  LanguageModelV4,
  NoSuchModelError,
  ProviderV2,
  ProviderV3,
  ProviderV4,
  RerankingModelV3,
  RerankingModelV4,
  SkillsV4,
  SpeechModelV2,
  SpeechModelV3,
  SpeechModelV4,
  TranscriptionModelV2,
  TranscriptionModelV3,
  TranscriptionModelV4,
} from '@ai-sdk/provider';
import { asEmbeddingModelV4 } from '../model/as-embedding-model-v4';
import { asImageModelV4 } from '../model/as-image-model-v4';
import { asLanguageModelV4 } from '../model/as-language-model-v4';
import { asProviderV4 } from '../model/as-provider-v4';
import { asRerankingModelV4 } from '../model/as-reranking-model-v4';
import { asSpeechModelV4 } from '../model/as-speech-model-v4';
import { asTranscriptionModelV4 } from '../model/as-transcription-model-v4';
import { asVideoModelV4 } from '../model/as-video-model-v4';

/**
 * Creates a custom provider with specified language models, text embedding models, image models, transcription models, speech models, and an optional fallback provider.
 *
 * @param {Object} options - The options for creating the custom provider.
 * @param {Record<string, LanguageModelV4>} [options.languageModels] - A record of language models, where keys are model IDs and values are LanguageModelV4 instances.
 * @param {Record<string, EmbeddingModelV4>} [options.embeddingModels] - A record of text embedding models, where keys are model IDs and values are EmbeddingModelV4 instances.
 * @param {Record<string, ImageModelV4>} [options.imageModels] - A record of image models, where keys are model IDs and values are ImageModelV4 instances.
 * @param {Record<string, TranscriptionModelV4>} [options.transcriptionModels] - A record of transcription models, where keys are model IDs and values are TranscriptionModelV4 instances.
 * @param {Record<string, SpeechModelV4>} [options.speechModels] - A record of speech models, where keys are model IDs and values are SpeechModelV4 instances.
 * @param {Record<string, RerankingModelV4>} [options.rerankingModels] - A record of reranking models, where keys are model IDs and values are RerankingModelV4 instances.
 * @param {ProviderV4} [options.fallbackProvider] - An optional fallback provider to use when a requested model is not found in the custom provider.
 * @returns {ProviderV4} A ProviderV4 object with languageModel, embeddingModel, imageModel, transcriptionModel, and speechModel methods.
 *
 * @throws {NoSuchModelError} Throws when a requested model is not found and no fallback provider is available.
 */
export function customProvider<
  LANGUAGE_MODELS extends Record<
    string,
    LanguageModelV2 | LanguageModelV3 | LanguageModelV4
  >,
  EMBEDDING_MODELS extends Record<string, EmbeddingModelV3 | EmbeddingModelV4>,
  IMAGE_MODELS extends Record<
    string,
    ImageModelV2 | ImageModelV3 | ImageModelV4
  >,
  TRANSCRIPTION_MODELS extends Record<
    string,
    TranscriptionModelV2 | TranscriptionModelV3 | TranscriptionModelV4
  >,
  SPEECH_MODELS extends Record<
    string,
    SpeechModelV2 | SpeechModelV3 | SpeechModelV4
  >,
  RERANKING_MODELS extends Record<string, RerankingModelV3 | RerankingModelV4>,
  VIDEO_MODELS extends Record<
    string,
    Experimental_VideoModelV3 | Experimental_VideoModelV4
  >,
  FILES extends FilesV4 | undefined = undefined,
  SKILLS extends SkillsV4 | undefined = undefined,
>({
  languageModels,
  embeddingModels,
  imageModels,
  transcriptionModels,
  speechModels,
  rerankingModels,
  videoModels,
  files,
  skills,
  fallbackProvider: fallbackProviderArg,
}: {
  languageModels?: LANGUAGE_MODELS;
  embeddingModels?: EMBEDDING_MODELS;
  imageModels?: IMAGE_MODELS;
  transcriptionModels?: TRANSCRIPTION_MODELS;
  speechModels?: SPEECH_MODELS;
  rerankingModels?: RERANKING_MODELS;
  videoModels?: VIDEO_MODELS;
  files?: FILES;
  skills?: SKILLS;
  fallbackProvider?: ProviderV4 | ProviderV3 | ProviderV2;
}): ProviderV4 & {
  languageModel(modelId: ExtractModelId<LANGUAGE_MODELS>): LanguageModelV4;
  embeddingModel(modelId: ExtractModelId<EMBEDDING_MODELS>): EmbeddingModelV4;
  imageModel(modelId: ExtractModelId<IMAGE_MODELS>): ImageModelV4;
  transcriptionModel(
    modelId: ExtractModelId<TRANSCRIPTION_MODELS>,
  ): TranscriptionModelV4;
  rerankingModel(modelId: ExtractModelId<RERANKING_MODELS>): RerankingModelV4;
  speechModel(modelId: ExtractModelId<SPEECH_MODELS>): SpeechModelV4;
  videoModel(modelId: ExtractModelId<VIDEO_MODELS>): Experimental_VideoModelV4;
} & (FILES extends FilesV4 ? { files(): FilesV4 } : { files?(): FilesV4 }) &
  (SKILLS extends SkillsV4 ? { skills(): SkillsV4 } : { skills?(): SkillsV4 }) {
  const fallbackProvider = fallbackProviderArg
    ? asProviderV4(fallbackProviderArg)
    : undefined;

  const resolvedFiles = files ?? fallbackProvider?.files?.();
  const resolvedSkills = skills ?? fallbackProvider?.skills?.();

  return {
    specificationVersion: 'v4',
    languageModel(modelId: ExtractModelId<LANGUAGE_MODELS>): LanguageModelV4 {
      if (languageModels != null && modelId in languageModels) {
        return asLanguageModelV4(languageModels[modelId]);
      }

      if (fallbackProvider) {
        return (fallbackProvider as ProviderV4).languageModel(modelId);
      }

      throw new NoSuchModelError({ modelId, modelType: 'languageModel' });
    },

    embeddingModel(
      modelId: ExtractModelId<EMBEDDING_MODELS>,
    ): EmbeddingModelV4 {
      if (embeddingModels != null && modelId in embeddingModels) {
        return asEmbeddingModelV4(embeddingModels[modelId]);
      }

      if (fallbackProvider) {
        return (fallbackProvider as ProviderV4).embeddingModel(modelId);
      }

      throw new NoSuchModelError({ modelId, modelType: 'embeddingModel' });
    },

    imageModel(modelId: ExtractModelId<IMAGE_MODELS>): ImageModelV4 {
      if (imageModels != null && modelId in imageModels) {
        return asImageModelV4(imageModels[modelId]);
      }

      if (fallbackProvider?.imageModel) {
        return (fallbackProvider as ProviderV4).imageModel(modelId);
      }

      throw new NoSuchModelError({ modelId, modelType: 'imageModel' });
    },

    transcriptionModel(
      modelId: ExtractModelId<TRANSCRIPTION_MODELS>,
    ): TranscriptionModelV4 {
      if (transcriptionModels != null && modelId in transcriptionModels) {
        return asTranscriptionModelV4(transcriptionModels[modelId]);
      }

      if (fallbackProvider?.transcriptionModel) {
        return (fallbackProvider as ProviderV4).transcriptionModel!(modelId);
      }

      throw new NoSuchModelError({ modelId, modelType: 'transcriptionModel' });
    },

    speechModel(modelId: ExtractModelId<SPEECH_MODELS>): SpeechModelV4 {
      if (speechModels != null && modelId in speechModels) {
        return asSpeechModelV4(speechModels[modelId]);
      }

      if (fallbackProvider?.speechModel) {
        return (fallbackProvider as ProviderV4).speechModel!(modelId);
      }

      throw new NoSuchModelError({ modelId, modelType: 'speechModel' });
    },
    rerankingModel(
      modelId: ExtractModelId<RERANKING_MODELS>,
    ): RerankingModelV4 {
      if (rerankingModels != null && modelId in rerankingModels) {
        return asRerankingModelV4(rerankingModels[modelId]);
      }

      if (fallbackProvider?.rerankingModel) {
        return fallbackProvider.rerankingModel(modelId);
      }

      throw new NoSuchModelError({ modelId, modelType: 'rerankingModel' });
    },
    videoModel(
      modelId: ExtractModelId<VIDEO_MODELS>,
    ): Experimental_VideoModelV4 {
      if (videoModels != null && modelId in videoModels) {
        return asVideoModelV4(videoModels[modelId]);
      }

      const videoModel = (fallbackProvider as any)?.videoModel;
      if (videoModel) {
        return videoModel(modelId);
      }

      throw new NoSuchModelError({ modelId, modelType: 'videoModel' });
    },
    ...(resolvedFiles != null ? { files: () => resolvedFiles } : {}),
    ...(resolvedSkills != null ? { skills: () => resolvedSkills } : {}),
  } as any; // necessary workaround to satisfy the complex return type while maintaining type safety
}

/**
 * @deprecated Use `customProvider` instead.
 */
export const experimental_customProvider = customProvider;

type ExtractModelId<MODELS extends Record<string, unknown>> = Extract<
  keyof MODELS,
  string
>;
