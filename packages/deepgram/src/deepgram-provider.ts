import { TranscriptionModelV1, ProviderV1 } from '@ai-sdk/provider';
import { FetchFunction, loadApiKey } from '@ai-sdk/provider-utils';
import { DeepgramTranscriptionModel } from './deepgram-transcription-model';
import { DeepgramTranscriptionModelId } from './deepgram-transcription-options';

export interface DeepgramProvider
  extends Pick<ProviderV1, 'transcriptionModel'> {
  (
    modelId: 'nova-3',
    settings?: {},
  ): {
    transcription: DeepgramTranscriptionModel;
  };

  /**
Creates a model for transcription.
   */
  transcription(modelId: DeepgramTranscriptionModelId): TranscriptionModelV1;
}

export interface DeepgramProviderSettings {
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
Create an Deepgram provider instance.
 */
export function createDeepgram(
  options: DeepgramProviderSettings = {},
): DeepgramProvider {
  const getHeaders = () => ({
    authorization: `Token ${loadApiKey({
      apiKey: options.apiKey,
      environmentVariableName: 'DEEPGRAM_API_KEY',
      description: 'Deepgram',
    })}`,
    ...options.headers,
  });

  const createTranscriptionModel = (modelId: DeepgramTranscriptionModelId) =>
    new DeepgramTranscriptionModel(modelId, {
      provider: `deepgram.transcription`,
      url: ({ path }) => `https://api.deepgram.com${path}`,
      headers: getHeaders,
      fetch: options.fetch,
    });

  const provider = function (modelId: DeepgramTranscriptionModelId) {
    return {
      transcription: createTranscriptionModel(modelId),
    };
  };

  provider.transcription = createTranscriptionModel;
  provider.transcriptionModel = createTranscriptionModel;

  return provider as DeepgramProvider;
}

/**
Default Deepgram provider instance.
 */
export const deepgram = createDeepgram();
