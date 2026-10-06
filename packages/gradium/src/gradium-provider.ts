import { NoSuchModelError, type ProviderV4 } from '@ai-sdk/provider';
import { loadApiKey } from '@ai-sdk/provider-utils';
import type { GradiumClientOptions } from '@gradium/sdk';
import type { GradiumConfig } from './gradium-config';
import type {
  GradiumSpeechModelId,
  GradiumTranscriptionModelId,
} from './gradium-options';
import { GradiumSpeechModel } from './gradium-speech-model';
import { GradiumTranscriptionModel } from './gradium-transcription-model';

export interface GradiumProvider extends ProviderV4 {
  (modelId?: GradiumTranscriptionModelId): {
    transcription: GradiumTranscriptionModel;
  };
  speech(modelId?: GradiumSpeechModelId): GradiumSpeechModel;
  speechModel(modelId?: GradiumSpeechModelId): GradiumSpeechModel;
  transcription(
    modelId?: GradiumTranscriptionModelId,
  ): GradiumTranscriptionModel;
  transcriptionModel(
    modelId?: GradiumTranscriptionModelId,
  ): GradiumTranscriptionModel;
  /** @deprecated Use embeddingModel instead. */
  textEmbeddingModel(modelId: string): never;
}

export interface GradiumProviderSettings extends Omit<
  GradiumClientOptions,
  'baseUrl'
> {
  /** Defaults to https://api.gradium.ai/api/. */
  baseURL?: string;
}

export function createGradium(
  options: GradiumProviderSettings = {},
): GradiumProvider {
  const config: Omit<GradiumConfig, 'provider'> = {
    baseURL: options.baseURL ?? 'https://api.gradium.ai/api/',
    apiKey: () =>
      loadApiKey({
        apiKey: options.apiKey,
        environmentVariableName: 'GRADIUM_API_KEY',
        description: 'Gradium',
      }),
    token: () => options.token,
    fetch: options.fetch,
    webSocketFactory: options.webSocketFactory,
    ttsRoute: options.ttsRoute,
    sttRoute: options.sttRoute,
  };
  const speech = (modelId: GradiumSpeechModelId = 'default') =>
    new GradiumSpeechModel(modelId, { ...config, provider: 'gradium.speech' });
  const transcription = (modelId: GradiumTranscriptionModelId = 'default') =>
    new GradiumTranscriptionModel(modelId, {
      ...config,
      provider: 'gradium.transcription',
    });
  const provider = (modelId: GradiumTranscriptionModelId = 'default') => ({
    transcription: transcription(modelId),
  });
  provider.specificationVersion = 'v4' as const;
  provider.speech = speech;
  provider.speechModel = speech;
  provider.transcription = transcription;
  provider.transcriptionModel = transcription;
  provider.languageModel = (modelId: string): never => {
    throw new NoSuchModelError({ modelId, modelType: 'languageModel' });
  };
  provider.embeddingModel = (modelId: string): never => {
    throw new NoSuchModelError({ modelId, modelType: 'embeddingModel' });
  };
  provider.textEmbeddingModel = provider.embeddingModel;
  provider.imageModel = (modelId: string): never => {
    throw new NoSuchModelError({ modelId, modelType: 'imageModel' });
  };
  return provider;
}

export const gradium = createGradium();
