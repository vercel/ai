import {
  EmbeddingModelV2,
  ImageModelV2,
  LanguageModelV2,
  NoSuchModelError,
  ProviderV2,
  RerankingModelV3,
  SpeechModelV2,
  TranscriptionModelV2,
} from '@ai-sdk/provider';

export class MockProviderV2 implements ProviderV2 {
  languageModel: ProviderV2['languageModel'];
  textEmbeddingModel: ProviderV2['textEmbeddingModel'];
  imageModel: ProviderV2['imageModel'];
  transcriptionModel: ProviderV2['transcriptionModel'];
  speechModel: ProviderV2['speechModel'];
  rerankingModel: ProviderV2['rerankingModel'];

  constructor({
    languageModels,
    embeddingModels,
    imageModels,
    transcriptionModels,
    speechModels,
    rerankingModels,
  }: {
    languageModels?: Record<string, LanguageModelV2>;
    embeddingModels?: Record<string, EmbeddingModelV2<string>>;
    imageModels?: Record<string, ImageModelV2>;
    transcriptionModels?: Record<string, TranscriptionModelV2>;
    speechModels?: Record<string, SpeechModelV2>;
    rerankingModels?: Record<string, RerankingModelV3<string>>;
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
    this.rerankingModel = (modelId: string) => {
      if (!rerankingModels?.[modelId]) {
        throw new NoSuchModelError({ modelId, modelType: 'rerankingModel' });
      }
      return rerankingModels[modelId];
    };
  }
}
