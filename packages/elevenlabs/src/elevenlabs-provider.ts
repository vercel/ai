import {
  TranscriptionModelV2,
  ProviderV2,
  NoSuchModelError,
} from '@ai-sdk/provider';
import { FetchFunction, loadApiKey } from '@ai-sdk/provider-utils';
import { ElevenLabsTranscriptionModel } from './elevenlabs-transcription-model';
import { ElevenLabsTranscriptionModelId } from './elevenlabs-transcription-options';

export interface ElevenLabsProvider extends ProviderV2 {
  (
    modelId: 'scribe_v1',
    settings?: {},
  ): {
    transcription: ElevenLabsTranscriptionModel;
  };

  /**
Creates a model for transcription.
   */
  transcription(modelId: ElevenLabsTranscriptionModelId): TranscriptionModelV2;
}

export interface ElevenLabsProviderSettings {
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
  const getHeaders = () => ({
    'xi-api-key': loadApiKey({
      apiKey: options.apiKey,
      environmentVariableName: 'ELEVENLABS_API_KEY',
      description: 'ElevenLabs',
    }),
    ...options.headers,
  });

  const createTranscriptionModel = (modelId: ElevenLabsTranscriptionModelId) =>
    new ElevenLabsTranscriptionModel(modelId, {
      provider: `elevenlabs.transcription`,
      url: ({ path }) => `https://api.elevenlabs.io${path}`,
      headers: getHeaders,
      fetch: options.fetch,
    });

  const provider = function (modelId: ElevenLabsTranscriptionModelId) {
    return {
      transcription: createTranscriptionModel(modelId),
    };
  };

  provider.transcription = createTranscriptionModel;
  provider.transcriptionModel = createTranscriptionModel;

  provider.languageModel = () => {
    throw new NoSuchModelError({
      modelId: 'unknown',
      modelType: 'languageModel',
      message: 'ElevenLabs does not provide language models',
    });
  };

  provider.textEmbeddingModel = () => {
    throw new NoSuchModelError({
      modelId: 'unknown',
      modelType: 'textEmbeddingModel',
      message: 'ElevenLabs does not provide text embedding models',
    });
  };

  provider.imageModel = () => {
    throw new NoSuchModelError({
      modelId: 'unknown',
      modelType: 'imageModel',
      message: 'ElevenLabs does not provide image models',
    });
  };

  return provider as ElevenLabsProvider;
}

/**
Default ElevenLabs provider instance.
 */
export const elevenlabs = createElevenLabs();
