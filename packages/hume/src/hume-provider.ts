import { SpeechModelV1, ProviderV1 } from '@ai-sdk/provider';
import { FetchFunction, loadApiKey } from '@ai-sdk/provider-utils';
import { HumeSpeechModel } from './hume-speech-model';

export interface HumeProvider extends Pick<ProviderV1, 'speechModel'> {
  (
    settings?: {},
  ): {
    speech: HumeSpeechModel;
  };

  /**
Creates a model for speech synthesis.
   */
  speech(): SpeechModelV1;
}

export interface HumeProviderSettings {
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
export function createHume(options: HumeProviderSettings = {}): HumeProvider {
  const getHeaders = () => ({
    'x-api-key': loadApiKey({
      apiKey: options.apiKey,
      environmentVariableName: 'LMNT_API_KEY',
      description: 'LMNT',
    }),
    ...options.headers,
  });

  const createSpeechModel = () =>
    new HumeSpeechModel('', {
      provider: `hume.speech`,
      url: ({ path }) => `https://api.hume.com${path}`,
      headers: getHeaders,
      fetch: options.fetch,
    });

  const provider = function () {
    return {
      speech: createSpeechModel(),
    };
  };

  provider.speech = createSpeechModel;
  provider.speechModel = createSpeechModel;

  return provider as HumeProvider;
}

/**
Default Hume provider instance.
 */
export const hume = createHume();
