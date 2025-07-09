<<<<<<< HEAD
import { SpeechModelV1, ProviderV1 } from '@ai-sdk/provider';
import { FetchFunction, loadApiKey } from '@ai-sdk/provider-utils';
import { HumeSpeechModel } from './hume-speech-model';

export interface HumeProvider extends Pick<ProviderV1, 'speechModel'> {
=======
import { SpeechModelV2, ProviderV2 } from '@ai-sdk/provider';
import { FetchFunction, loadApiKey } from '@ai-sdk/provider-utils';
import { HumeSpeechModel } from './hume-speech-model';

export interface HumeProvider extends Pick<ProviderV2, 'speechModel'> {
>>>>>>> ffac5e5f564b670187256f9adb84a0095255e1f9
  (settings?: {}): {
    speech: HumeSpeechModel;
  };

  /**
Creates a model for speech synthesis.
   */
<<<<<<< HEAD
  speech(): SpeechModelV1;
=======
  speech(): SpeechModelV2;
>>>>>>> ffac5e5f564b670187256f9adb84a0095255e1f9
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
Create an Hume provider instance.
 */
export function createHume(options: HumeProviderSettings = {}): HumeProvider {
  const getHeaders = () => ({
    'X-Hume-Api-Key': loadApiKey({
      apiKey: options.apiKey,
      environmentVariableName: 'HUME_API_KEY',
      description: 'Hume',
    }),
    ...options.headers,
  });

  const createSpeechModel = () =>
    new HumeSpeechModel('', {
      provider: `hume.speech`,
      url: ({ path }) => `https://api.hume.ai${path}`,
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
