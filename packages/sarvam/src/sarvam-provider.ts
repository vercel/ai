import { TranscriptionModelV1, ProviderV1 } from '@ai-sdk/provider';
import { FetchFunction, loadApiKey } from '@ai-sdk/provider-utils';
import { SarvamTranscriptionModel } from './sarvam-transcription-model';
import { SarvamTranscriptionModelId } from './sarvam-transcription-settings';

export interface SarvamProvider extends Pick<ProviderV1, 'transcriptionModel'> {
  (
    modelId: 'saarika:v2',
    settings?: {},
  ): {
    transcription: SarvamTranscriptionModel;
  };

  /**
   * Creates a model for transcription.
   */
  transcription(modelId: SarvamTranscriptionModelId): TranscriptionModelV1;
}

export interface SarvamProviderSettings {
  apiKey?: string;
  headers?: Record<string, string>;
  fetch?: FetchFunction;
}

export function createSarvam(
  options: SarvamProviderSettings = {},
): SarvamProvider {
  const getHeaders = () => ({
    ...options.headers,
  });

  const createTranscriptionModel = (modelId: SarvamTranscriptionModelId) =>
    new SarvamTranscriptionModel(modelId, {
      provider: `sarvam.transcription`,
      url: ({ path }) => `https://api.sarvam.ai${path}`,
      headers: getHeaders,
      fetch: options.fetch,
    });

  const provider = function (modelId: SarvamTranscriptionModelId) {
    return {
      transcription: createTranscriptionModel(modelId),
    };
  };

  provider.transcription = createTranscriptionModel;
  provider.transcriptionModel = createTranscriptionModel;

  return provider as SarvamProvider;
}

export const sarvam = createSarvam();
