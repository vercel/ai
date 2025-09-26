import {
  EmbeddingModelV3,
  ImageModelV3,
  LanguageModelV2,
  NoSuchModelError,
  ProviderV3,
  SpeechModelV2,
  TranscriptionModelV2,
} from '@ai-sdk/provider';

export class MockProviderV3 implements ProviderV3 {
  languageModel: ProviderV3['languageModel'];
  textEmbeddingModel: ProviderV3['textEmbeddingModel'];
  imageModel: ProviderV3['imageModel'];
  transcriptionModel: ProviderV3['transcriptionModel'];
  speechModel: ProviderV3['speechModel'];

  constructor({
    languageModels,
    embeddingModels,
    imageModels,
    transcriptionModels,
    speechModels,
  }: {
    languageModels?: Record<string, LanguageModelV2>;
    embeddingModels?: Record<string, EmbeddingModelV3<string>>;
    imageModels?: Record<string, ImageModelV3>;
    transcriptionModels?: Record<string, TranscriptionModelV2>;
    speechModels?: Record<string, SpeechModelV2>;
  } = {}) {
    this.languageModel = (modelId: string) => {
      if (!languageModels?.[modelId]) {
        throw new NoSuchModelError({ modelId, modelType: 'languageModel' });
      }
      return languageModels[modelId];
    };
    this.textEmbeddingModel = (modelId: string) => {
      if (!embeddingModels?.[modelId]) {
        throw new NoSuchModelError({
          modelId,
          modelType: 'textEmbeddingModel',
        });
      }
      return embeddingModels[modelId];
    };
    this.imageModel = (modelId: string) => {
      if (!imageModels?.[modelId]) {
        throw new NoSuchModelError({ modelId, modelType: 'imageModel' });
      }
      return imageModels[modelId];
    };
    this.transcriptionModel = (modelId: string) => {
      if (!transcriptionModels?.[modelId]) {
        throw new NoSuchModelError({
          modelId,
          modelType: 'transcriptionModel',
        });
      }
      return transcriptionModels[modelId];
    };
    this.speechModel = (modelId: string) => {
      if (!speechModels?.[modelId]) {
        throw new NoSuchModelError({ modelId, modelType: 'speechModel' });
      }
      return speechModels[modelId];
    };
  }
}
