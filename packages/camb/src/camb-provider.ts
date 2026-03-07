import { SpeechModelV3, ProviderV3, NoSuchModelError } from '@ai-sdk/provider';
import {
  FetchFunction,
  loadApiKey,
  withUserAgentSuffix,
} from '@ai-sdk/provider-utils';
import { CambSpeechModel } from './camb-speech-model';
import { CambSpeechModelId } from './camb-speech-options';
import { VERSION } from './version';

export interface CambProvider extends ProviderV3 {
  /**
   * Creates a model for speech generation.
   */
  speech(modelId: CambSpeechModelId): SpeechModelV3;

  /**
   * @deprecated Use `embeddingModel` instead.
   */
  textEmbeddingModel(modelId: string): never;
}

export interface CambProviderSettings {
  /**
   * API key for authenticating requests.
   */
  apiKey?: string;

  /**
   * Base URL for the CAMB AI API.
   *
   * @default 'https://client.camb.ai/apis'
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
 * Create a CAMB AI provider instance.
 */
export function createCamb(options: CambProviderSettings = {}): CambProvider {
  const baseURL = options.baseURL ?? 'https://client.camb.ai/apis';

  const getHeaders = () =>
    withUserAgentSuffix(
      {
        'x-api-key': loadApiKey({
          apiKey: options.apiKey,
          environmentVariableName: 'CAMB_API_KEY',
          description: 'CAMB AI',
        }),
        ...options.headers,
      },
      `ai-sdk/camb/${VERSION}`,
    );

  const createSpeechModel = (modelId: CambSpeechModelId) =>
    new CambSpeechModel(modelId, {
      provider: 'camb.speech',
      url: ({ path }) => `${baseURL}${path}`,
      headers: getHeaders,
      fetch: options.fetch,
    });

  const provider = function () {
    throw new NoSuchModelError({
      modelId: '',
      modelType: 'languageModel',
      message: 'CAMB AI does not provide language models',
    });
  };

  provider.specificationVersion = 'v3' as const;
  provider.speech = createSpeechModel;
  provider.speechModel = createSpeechModel;

  provider.languageModel = (modelId: string) => {
    throw new NoSuchModelError({
      modelId,
      modelType: 'languageModel',
      message: 'CAMB AI does not provide language models',
    });
  };

  provider.embeddingModel = (modelId: string) => {
    throw new NoSuchModelError({
      modelId,
      modelType: 'embeddingModel',
      message: 'CAMB AI does not provide embedding models',
    });
  };
  provider.textEmbeddingModel = provider.embeddingModel;

  provider.imageModel = (modelId: string) => {
    throw new NoSuchModelError({
      modelId,
      modelType: 'imageModel',
      message: 'CAMB AI does not provide image models',
    });
  };

  return provider as CambProvider;
}

/**
 * Default CAMB AI provider instance.
 */
export const camb = createCamb();
