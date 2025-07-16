import { TranscriptionModelV1, ProviderV1 } from '@ai-sdk/provider';
import { FetchFunction, loadApiKey } from '@ai-sdk/provider-utils';
import { RevaiTranscriptionModel } from './revai-transcription-model';
import { RevaiTranscriptionModelId } from './revai-transcription-settings';

export interface RevaiProvider extends Pick<ProviderV1, 'transcriptionModel'> {
  (
    modelId: 'machine',
    settings?: {},
  ): {
    transcription: RevaiTranscriptionModel;
  };

  /**
Creates a model for transcription.
   */
  transcription(modelId: RevaiTranscriptionModelId): TranscriptionModelV1;
}

export interface RevaiProviderSettings {
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
Create a Rev.ai provider instance.
 */
export function createRevai(
  options: RevaiProviderSettings = {},
): RevaiProvider {
  const getHeaders = () => ({
    authorization: `Bearer ${loadApiKey({
      apiKey: options.apiKey,
      environmentVariableName: 'REVAI_API_KEY',
      description: 'Rev.ai',
    })}`,
    ...options.headers,
  });

  const createTranscriptionModel = (modelId: RevaiTranscriptionModelId) =>
    new RevaiTranscriptionModel(modelId, {
      provider: `revai.transcription`,
      url: ({ path }) => `https://api.rev.ai${path}`,
      headers: getHeaders,
      fetch: options.fetch,
    });

  const provider = function (modelId: RevaiTranscriptionModelId) {
    return {
      transcription: createTranscriptionModel(modelId),
    };
  };

  provider.transcription = createTranscriptionModel;
  provider.transcriptionModel = createTranscriptionModel;

  return provider as RevaiProvider;
}

/**
Default Rev.ai provider instance.
 */
export const revai = createRevai();
