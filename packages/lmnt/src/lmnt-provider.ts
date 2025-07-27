import { SpeechModelV2, ProviderV2 } from '@ai-sdk/provider';
import { FetchFunction, loadApiKey } from '@ai-sdk/provider-utils';
import { LMNTSpeechModel } from './lmnt-speech-model';
import { LMNTSpeechModelId } from './lmnt-speech-options';

export interface LMNTProvider extends Pick<ProviderV2, 'speechModel'> {
  (
    modelId: 'aurora',
    settings?: {},
  ): {
    speech: LMNTSpeechModel;
  };

  /**
Creates a model for speech synthesis.
   */
  speech(modelId: LMNTSpeechModelId): SpeechModelV2;
}

export interface LMNTProviderSettings {
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
Create an LMNT provider instance.
 */
export function createLMNT(options: LMNTProviderSettings = {}): LMNTProvider {
  const getHeaders = () => ({
    'x-api-key': loadApiKey({
      apiKey: options.apiKey,
      environmentVariableName: 'LMNT_API_KEY',
      description: 'LMNT',
    }),
    ...options.headers,
  });

  const createSpeechModel = (modelId: LMNTSpeechModelId) =>
    new LMNTSpeechModel(modelId, {
      provider: `lmnt.speech`,
      url: ({ path }) => `https://api.lmnt.com${path}`,
      headers: getHeaders,
      fetch: options.fetch,
    });

  const provider = function (modelId: LMNTSpeechModelId) {
    return {
      speech: createSpeechModel(modelId),
    };
  };

  provider.speech = createSpeechModel;
  provider.speechModel = createSpeechModel;

  return provider as LMNTProvider;
}

/**
Default LMNT provider instance.
 */
export const lmnt = createLMNT();
