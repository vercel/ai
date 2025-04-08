import {
  EmbeddingModelV1,
  ImageModelV1,
  TranscriptionModelV1,
  LanguageModelV1,
  ProviderV1,
} from '@ai-sdk/provider';
import {
  FetchFunction,
  loadApiKey,
  withoutTrailingSlash,
} from '@ai-sdk/provider-utils';
import { ElevenLabsTranscriptionModel } from './elevenlabs-transcription-model';
import { ElevenLabsTranscriptionModelId } from './elevenlabs-transcription-settings';
import { ElevenLabsProvider } from '.';

type ElevenLabsTranscriptionLanguageModel = {
  transcription: ElevenLabsTranscriptionModel;
};

export interface ElevenLabsProvider extends ProviderV1 {
  (modelId: 'scribe_v1', settings?: {}): ElevenLabsTranscriptionLanguageModel;

  /**
Creates a model for transcription.
   */
  transcription(modelId: ElevenLabsTranscriptionModelId): TranscriptionModelV1;
}

export interface ElevenLabsProviderSettings {
  /**
Base URL for the ElevenLabs API calls.
     */
  baseURL?: string;

  /**
API key for authenticating requests.
     */
  apiKey?: string;

  /**
Custom headers to include in the requests.
     */
  headers?: Record<string, string>;

  /**
Custom fetch implementation. You can use it as a middleware to intercept requests,
or to provide a custom fetch implementation for e.g. testing.
    */
  fetch?: FetchFunction;
}

/**
Create an ElevenLabs provider instance.
 */
export function createElevenLabs(
  options: ElevenLabsProviderSettings = {},
): ElevenLabsProvider {
  const baseURL =
    withoutTrailingSlash(options.baseURL) ?? 'https://api.elevenlabs.io/';

  const getHeaders = () => ({
    Authorization: `Bearer ${loadApiKey({
      apiKey: options.apiKey,
      environmentVariableName: 'ELEVENLABS_API_KEY',
      description: 'ElevenLabs',
    })}`,
    ...options.headers,
  });

  const createTranscriptionModel = (modelId: ElevenLabsTranscriptionModelId) =>
    new ElevenLabsTranscriptionModel(modelId, {
      provider: `elevenlabs.transcription`,
      url: ({ path }) => `${baseURL}${path}`,
      headers: getHeaders,
      fetch: options.fetch,
    });

  const provider: ElevenLabsProvider = () => ({
    transcription: createTranscriptionModel,
    transcriptionModel: createTranscriptionModel,
  });

  return provider;
}

/**
Default ElevenLabs provider instance.
 */
export const elevenlabs = createElevenLabs();
