import {
  type LanguageModelV4,
  type SpeechModelProviderV4,
  type TranscriptionModelProviderV4,
  type EmbeddingModelProviderV4,
  type ImageModelProviderV4,
} from '@ai-sdk/provider';
import {
  loadApiKey,
  noSuchModel,
  withUserAgentSuffix,
  type FetchFunction,
} from '@ai-sdk/provider-utils';
import { FishAudioSpeechModel } from './fish-audio-speech-model';
import type { FishAudioSpeechModelId } from './fish-audio-speech-options';
import { FishAudioTranscriptionModel } from './fish-audio-transcription-model';
import type { FishAudioTranscriptionModelId } from './fish-audio-transcription-options';
import { VERSION } from './version';

export interface FishAudioProvider
  extends
    SpeechModelProviderV4<FishAudioSpeechModelId>,
    TranscriptionModelProviderV4<FishAudioTranscriptionModelId>,
    EmbeddingModelProviderV4,
    ImageModelProviderV4 {
  (
    modelId: FishAudioSpeechModelId,
    settings?: {},
  ): {
    speech: FishAudioSpeechModel;
  };

  languageModel(modelId: string): LanguageModelV4;
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
      `ai-sdk-fish-audio/${VERSION}`,
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
  provider.languageModel = (modelId: string) =>
    noSuchModel(modelId, 'languageModel');

  provider.embeddingModel = (modelId: string) =>
    noSuchModel(modelId, 'embeddingModel');
  provider.embedding = provider.embeddingModel;
  provider.textEmbeddingModel = provider.embeddingModel;

  provider.imageModel = (modelId: string) => noSuchModel(modelId, 'imageModel');
  provider.image = provider.imageModel;

  return provider;
}

/**
 * Default Fish Audio provider instance.
 */
export const fishAudio = createFishAudio();
