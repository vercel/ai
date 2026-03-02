import {
  EmbeddingModelV3,
  ImageModelV3,
  LanguageModelV4,
  NoSuchModelError,
  ProviderV4,
  SpeechModelV3,
  TranscriptionModelV3,
  RerankingModelV3,
} from '@ai-sdk/provider';

export class MockProviderV4 implements ProviderV4 {
  readonly specificationVersion = 'v4' as const;

  languageModel: ProviderV4['languageModel'];
  embeddingModel: ProviderV4['embeddingModel'];
  imageModel: ProviderV4['imageModel'];
  transcriptionModel: ProviderV4['transcriptionModel'];
  speechModel: ProviderV4['speechModel'];
  rerankingModel: ProviderV4['rerankingModel'];

  constructor({
    languageModels,
    embeddingModels,
    imageModels,
    transcriptionModels,
    speechModels,
    rerankingModels,
  }: {
    languageModels?: Record<string, LanguageModelV4>;
    embeddingModels?: Record<string, EmbeddingModelV3>;
    imageModels?: Record<string, ImageModelV3>;
    transcriptionModels?: Record<string, TranscriptionModelV3>;
    speechModels?: Record<string, SpeechModelV3>;
    rerankingModels?: Record<string, RerankingModelV3>;
  } = {}) {
    this.languageModel = (modelId: string) => {
      if (!languageModels?.[modelId]) {
        throw new NoSuchModelError({ modelId, modelType: 'languageModel' });
      }
      return languageModels[modelId];
    };
    this.embeddingModel = (modelId: string) => {
      if (!embeddingModels?.[modelId]) {
        throw new NoSuchModelError({
          modelId,
          modelType: 'embeddingModel',
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
    this.speechModel = (modelId: string): SpeechModelV3 => {
      if (!speechModels?.[modelId]) {
        throw new NoSuchModelError({ modelId, modelType: 'speechModel' });
      }
      return speechModels[modelId];
    };
    this.rerankingModel = (modelId: string) => {
      if (!rerankingModels?.[modelId]) {
        throw new NoSuchModelError({ modelId, modelType: 'rerankingModel' });
      }
      return rerankingModels[modelId];
    };
  }
}
