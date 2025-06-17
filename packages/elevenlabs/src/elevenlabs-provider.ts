import {
  TranscriptionModelV1,
  ProviderV1,
  VoiceChangerModelV1,
} from '@ai-sdk/provider';
import { FetchFunction, loadApiKey } from '@ai-sdk/provider-utils';
import { ElevenLabsTranscriptionModel } from './elevenlabs-transcription-model';
import { ElevenLabsTranscriptionModelId } from './elevenlabs-transcription-settings';
import { ElevenLabsVoiceChangerModel } from './elevenlabs-voice-changer-model';
import { ElevenLabsVoiceChangerModelId } from './elevenlabs-voice-changer-settings';

export interface ElevenLabsProvider
  extends Pick<ProviderV1, 'transcriptionModel' | 'voiceChangerModel'> {
  (
    modelId: 'scribe_v1',
    settings?: {},
  ): {
    transcription: ElevenLabsTranscriptionModel;
    voiceChanger: ElevenLabsVoiceChangerModel;
  };

  /**
Creates a model for transcription.
   */
  transcription(modelId: ElevenLabsTranscriptionModelId): TranscriptionModelV1;

  /**
Creates a model for voice changer.
   */
  voiceChanger(modelId: ElevenLabsVoiceChangerModelId): VoiceChangerModelV1;
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

  const createVoiceChangerModel = (modelId: ElevenLabsVoiceChangerModelId) =>
    new ElevenLabsVoiceChangerModel(modelId, {
      provider: `elevenlabs.voiceChanger`,
      url: ({ path }) => `https://api.elevenlabs.io${path}`,
      headers: getHeaders,
      fetch: options.fetch,
    });

  const provider = function (modelId: ElevenLabsTranscriptionModelId) {
    return {
      transcription: createTranscriptionModel(modelId),
      voiceChanger: createVoiceChangerModel(modelId),
    };
  };

  provider.transcription = createTranscriptionModel;
  provider.transcriptionModel = createTranscriptionModel;

  provider.voiceChanger = createVoiceChangerModel;
  provider.voiceChangerModel = createVoiceChangerModel;

  return provider as ElevenLabsProvider;
}

/**
Default ElevenLabs provider instance.
 */
export const elevenlabs = createElevenLabs();
