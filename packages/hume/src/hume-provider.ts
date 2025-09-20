import { SpeechModelV2, ProviderV2 } from '@ai-sdk/provider';
import {
  FetchFunction,
  loadApiKey,
  withUserAgentSuffix,
} from '@ai-sdk/provider-utils';
import { HumeSpeechModel } from './hume-speech-model';
import { VERSION } from './version';

export interface HumeProvider extends Pick<ProviderV2, 'speechModel'> {
  (settings?: {}): {
    speech: HumeSpeechModel;
  };

  /**
Creates a model for speech synthesis.
   */
  speech(): SpeechModelV2;
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
  const getHeaders = () =>
    withUserAgentSuffix(
      {
        'X-Hume-Api-Key': loadApiKey({
          apiKey: options.apiKey,
          environmentVariableName: 'HUME_API_KEY',
          description: 'Hume',
        }),
        ...options.headers,
      },
      `ai-sdk/hume/${VERSION}`,
    );

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

  return provider satisfies HumeProvider;
}

/**
Default Hume provider instance.
 */
export const hume = createHume();
