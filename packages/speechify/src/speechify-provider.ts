import {
  NoSuchModelError,
  type SpeechModelV4,
  type ProviderV4,
} from '@ai-sdk/provider';
import {
  loadApiKey,
  withUserAgentSuffix,
  withoutTrailingSlash,
  type FetchFunction,
} from '@ai-sdk/provider-utils';
import { SpeechifySpeechModel } from './speechify-speech-model';
import type { SpeechifySpeechModelId } from './speechify-speech-options';
import { VERSION } from './version';

const DEFAULT_BASE_URL = 'https://api.sws.speechify.com';

export interface SpeechifyProvider extends ProviderV4 {
  (modelId: SpeechifySpeechModelId): {
    speech: SpeechifySpeechModel;
  };

  /**
   * Creates a model for speech synthesis.
   */
  speech(modelId: SpeechifySpeechModelId): SpeechModelV4;
}

export interface SpeechifyProviderSettings {
  /**
   * API key for authenticating requests.
   */
  apiKey?: string;

  /**
   * Base URL for the API calls. Defaults to `https://api.sws.speechify.com`.
   */
  baseURL?: string;

  /**
   * Custom headers to include in the requests.
   */
  headers?: Record<string, string>;

  /**
   * Custom fetch implementation. You can use it as a middleware to intercept requests,
   * or to provide a custom fetch implementation for e.g. testing.
   */
  fetch?: FetchFunction;
}

/**
 * Create a Speechify provider instance.
 */
export function createSpeechify(
  options: SpeechifyProviderSettings = {},
): SpeechifyProvider {
  const baseURL = withoutTrailingSlash(options.baseURL) ?? DEFAULT_BASE_URL;

  const getHeaders = () =>
    withUserAgentSuffix(
      {
        authorization: `Bearer ${loadApiKey({
          apiKey: options.apiKey,
          environmentVariableName: 'SPEECHIFY_API_KEY',
          description: 'Speechify',
        })}`,
        'Speechify-Caller': 'vercel',
        ...options.headers,
      },
      `ai-sdk/speechify/${VERSION}`,
    );

  const createSpeechModel = (modelId: SpeechifySpeechModelId) =>
    new SpeechifySpeechModel(modelId, {
      provider: `speechify.speech`,
      url: ({ path }) => `${baseURL}${path}`,
      headers: getHeaders,
      fetch: options.fetch,
    });

  const provider = function (modelId: SpeechifySpeechModelId) {
    return {
      speech: createSpeechModel(modelId),
    };
  };

  provider.specificationVersion = 'v4' as const;
  provider.speech = createSpeechModel;
  provider.speechModel = createSpeechModel;

  provider.languageModel = (modelId: string) => {
    throw new NoSuchModelError({
      modelId,
      modelType: 'languageModel',
      message: 'Speechify does not provide language models',
    });
  };

  provider.embeddingModel = (modelId: string) => {
    throw new NoSuchModelError({
      modelId,
      modelType: 'embeddingModel',
      message: 'Speechify does not provide embedding models',
    });
  };

  provider.imageModel = (modelId: string) => {
    throw new NoSuchModelError({
      modelId,
      modelType: 'imageModel',
      message: 'Speechify does not provide image models',
    });
  };

  return provider as SpeechifyProvider;
}

/**
 * Default Speechify provider instance.
 */
export const speechify = createSpeechify();
