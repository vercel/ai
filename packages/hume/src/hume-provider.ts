import {
  type SpeechModelV4,
  type LanguageModelV4,
  type EmbeddingModelProviderV4,
  type ImageModelProviderV4,
} from '@ai-sdk/provider';
import {
  loadApiKey,
  noSuchModel,
  withUserAgentSuffix,
  type FetchFunction,
} from '@ai-sdk/provider-utils';
import { HumeSpeechModel } from './hume-speech-model';
import { VERSION } from './version';

export interface HumeProvider
  extends EmbeddingModelProviderV4, ImageModelProviderV4 {
  (settings?: {}): {
    speech: HumeSpeechModel;
  };

  languageModel(modelId: string): LanguageModelV4;

  /**
   * Creates a model for speech synthesis.
   */
  speech(): SpeechModelV4;
}

export interface HumeProviderSettings {
  /**
   * API key for authenticating requests.
   */
  apiKey?: string;

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
 * Create an Hume provider instance.
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
      `ai-sdk-hume/${VERSION}`,
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

  provider.specificationVersion = 'v4' as const;
  provider.speech = createSpeechModel;
  provider.speechModel = createSpeechModel;

  provider.languageModel = (modelId: string) =>
    noSuchModel(modelId, 'languageModel');

  provider.embeddingModel = (modelId: string) =>
    noSuchModel(modelId, 'embeddingModel');
  provider.embedding = provider.embeddingModel;

  provider.imageModel = (modelId: string) => noSuchModel(modelId, 'imageModel');
  provider.image = provider.imageModel;

  return provider;
}

/**
 * Default Hume provider instance.
 */
export const hume = createHume();
