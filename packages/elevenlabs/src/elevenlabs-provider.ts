import {
  TranscriptionModelV1,
  ProviderV1,
} from '@ai-sdk/provider';
import {
  FetchFunction,
  loadApiKey,
  withoutTrailingSlash,
} from '@ai-sdk/provider-utils';
import { ElevenLabsTranscriptionModel } from './elevenlabs-transcription-model';
import { ElevenLabsTranscriptionModelId } from './elevenlabs-transcription-settings';

export interface ElevenLabsProvider extends Pick<ProviderV1, 'transcriptionModel'> {
  (modelId: 'scribe_v1', settings?: {}): {
    transcription: ElevenLabsTranscriptionModel;
  };

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

  const provider = function (
    modelId: ElevenLabsTranscriptionModelId,
  ) {
    return {
      transcription: createTranscriptionModel(modelId),
    };
  };

  provider.transcription = createTranscriptionModel;
  provider.transcriptionModel = createTranscriptionModel;

  return provider as ElevenLabsProvider;
}

/**
Default ElevenLabs provider instance.
 */
export const elevenlabs = createElevenLabs();
