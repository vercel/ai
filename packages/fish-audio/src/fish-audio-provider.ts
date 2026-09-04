import {
  NoSuchModelError,
  type ProviderV4,
  type SpeechModelV4,
  type TranscriptionModelV4,
} from '@ai-sdk/provider';
import {
  loadApiKey,
  withUserAgentSuffix,
  type FetchFunction,
} from '@ai-sdk/provider-utils';
import { FishAudioSpeechModel } from './fish-audio-speech-model';
import type { FishAudioSpeechModelId } from './fish-audio-speech-options';
import { FishAudioTranscriptionModel } from './fish-audio-transcription-model';
import type { FishAudioTranscriptionModelId } from './fish-audio-transcription-options';
import { VERSION } from './version';

export interface FishAudioProvider extends ProviderV4 {
  (
    modelId: FishAudioSpeechModelId,
    settings?: {},
  ): {
    speech: FishAudioSpeechModel;
  };

  /**
   * Creates a model for speech generation.
   */
  speech(modelId: FishAudioSpeechModelId): SpeechModelV4;

  /**
   * Creates a model for speech generation.
   *
   * Narrowed to required: Fish Audio always provides speech models.
   */
  speechModel(modelId: FishAudioSpeechModelId): SpeechModelV4;

  /**
   * Creates a model for transcription.
   */
  transcription(modelId?: FishAudioTranscriptionModelId): TranscriptionModelV4;

  /**
   * Creates a model for transcription.
   *
   * Narrowed to required: Fish Audio always provides a transcription model.
   */
  transcriptionModel(
    modelId?: FishAudioTranscriptionModelId,
  ): TranscriptionModelV4;
}

export interface FishAudioProviderSettings {
  /**
   * API key for authenticating requests.
   */
  apiKey?: string;

  /**
   * Base URL for the API calls.
   */
  baseURL?: string;

  /**
   * Custom headers to include in the requests.
   */
  headers?: Record<string, string>;

  /**
   * Custom fetch implementation. You can use it as a middleware to intercept requests,
   * or to provide a custom fetch implementation for e.g. testing.
   */
  fetch?: FetchFunction;
}

const DEFAULT_BASE_URL = 'https://api.fish.audio';

/**
 * Create a Fish Audio provider instance.
 */
export function createFishAudio(
  options: FishAudioProviderSettings = {},
): FishAudioProvider {
  const baseURL = options.baseURL?.replace(/\/$/, '') ?? DEFAULT_BASE_URL;

  const getHeaders = () =>
    withUserAgentSuffix(
      {
        Authorization: `Bearer ${loadApiKey({
          apiKey: options.apiKey,
          environmentVariableName: 'FISH_AUDIO_API_KEY',
          description: 'Fish Audio',
        })}`,
        ...options.headers,
      },
      `ai-sdk/fish-audio/${VERSION}`,
    );

  const createSpeechModel = (modelId: FishAudioSpeechModelId) =>
    new FishAudioSpeechModel(modelId, {
      provider: 'fish-audio.speech',
      url: ({ path }) => `${baseURL}${path}`,
      headers: getHeaders,
      fetch: options.fetch,
    });

  // `/v1/asr` has no model selector, so the model ID is a routing label and
  // defaults to `transcribe-1`.
  const createTranscriptionModel = (
    modelId: FishAudioTranscriptionModelId = 'transcribe-1',
  ) =>
    new FishAudioTranscriptionModel(modelId, {
      provider: 'fish-audio.transcription',
      url: ({ path }) => `${baseURL}${path}`,
      headers: getHeaders,
      fetch: options.fetch,
    });

  const provider = function (modelId: FishAudioSpeechModelId) {
    return {
      speech: createSpeechModel(modelId),
    };
  };

  provider.specificationVersion = 'v4' as const;
  provider.speech = createSpeechModel;
  provider.speechModel = createSpeechModel;
  provider.transcription = createTranscriptionModel;
  provider.transcriptionModel = createTranscriptionModel;

  // Required ProviderV4 methods that are not supported
  provider.languageModel = (modelId: string) => {
    throw new NoSuchModelError({
      modelId,
      modelType: 'languageModel',
      message: 'Fish Audio does not provide language models',
    });
  };

  provider.embeddingModel = (modelId: string) => {
    throw new NoSuchModelError({
      modelId,
      modelType: 'embeddingModel',
      message: 'Fish Audio does not provide embedding models',
    });
  };
  provider.textEmbeddingModel = provider.embeddingModel;

  provider.imageModel = (modelId: string) => {
    throw new NoSuchModelError({
      modelId,
      modelType: 'imageModel',
      message: 'Fish Audio does not provide image models',
    });
  };

  return provider as FishAudioProvider;
}

/**
 * Default Fish Audio provider instance.
 */
export const fishAudio = createFishAudio();
