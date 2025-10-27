import { ProviderV2, ProviderV3 } from '@ai-sdk/provider';
import { asEmbeddingModelV3 } from './as-embedding-model-v3';
import { asImageModelV3 } from './as-image-model-v3';
import { asLanguageModelV3 } from './as-language-model-v3';
import { asTranscriptionModelV3 } from './as-transcription-model-v3';
import { asSpeechModelV3 } from './as-speech-model-v3';

export function asProviderV3(provider: ProviderV2 | ProviderV3): ProviderV3 {
  if (
    'specificationVersion' in provider &&
    provider.specificationVersion === 'v3'
  ) {
    return provider;
  }

  return {
    specificationVersion: 'v3',
    languageModel: (modelId: string) =>
      asLanguageModelV3(provider.languageModel(modelId)),
    textEmbeddingModel: (modelId: string) =>
      asEmbeddingModelV3(provider.textEmbeddingModel(modelId)),
    imageModel: (modelId: string) =>
      asImageModelV3(provider.imageModel(modelId)),
    transcriptionModel: provider.transcriptionModel
      ? (modelId: string) =>
          asTranscriptionModelV3(provider.transcriptionModel!(modelId))
      : undefined,
    speechModel: provider.speechModel
      ? (modelId: string) => asSpeechModelV3(provider.speechModel!(modelId))
      : undefined,
  };
}
