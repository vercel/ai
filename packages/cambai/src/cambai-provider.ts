import {
  TranscriptionModelV3,
  SpeechModelV3,
  ProviderV3,
  NoSuchModelError,
} from '@ai-sdk/provider';
import {
  FetchFunction,
  loadApiKey,
  withUserAgentSuffix,
} from '@ai-sdk/provider-utils';
import { CambaiTranscriptionModel } from './cambai-transcription-model';
import { CambaiTranscriptionModelId } from './cambai-transcription-options';
import { CambaiSpeechModel } from './cambai-speech-model';
import { CambaiSpeechModelId } from './cambai-speech-options';
import { VERSION } from './version';

export interface CambaiProvider extends ProviderV3 {
  /**
   * Creates a model for speech generation (TTS).
   */
  speech(modelId: CambaiSpeechModelId): SpeechModelV3;

  /**
   * Creates a model for transcription (STT).
   */
  transcription(modelId: CambaiTranscriptionModelId): TranscriptionModelV3;

  /**
   * @deprecated Use `embeddingModel` instead.
   */
  textEmbeddingModel(modelId: string): never;
}

export interface CambaiProviderSettings {
  /**
   * API key for authenticating requests.
   * Falls back to the `CAMB_API_KEY` environment variable.
   */
  apiKey?: string;

  /**
   * Base URL for the Camb.ai API.
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
 * Create a Camb.ai provider instance.
 */
export function createCambai(
  options: CambaiProviderSettings = {},
): CambaiProvider {
  const baseURL = options.baseURL ?? 'https://client.camb.ai/apis';

  const getHeaders = () =>
    withUserAgentSuffix(
      {
        'x-api-key': loadApiKey({
          apiKey: options.apiKey,
          environmentVariableName: 'CAMB_API_KEY',
          description: 'Camb.ai',
        }),
        ...options.headers,
      },
      `ai-sdk/cambai/${VERSION}`,
    );

  const createTranscriptionModel = (modelId: CambaiTranscriptionModelId) =>
    new CambaiTranscriptionModel(modelId, {
      provider: `cambai.transcription`,
      url: ({ path }) => `${baseURL}${path}`,
      headers: getHeaders,
      fetch: options.fetch,
    });

  const createSpeechModel = (modelId: CambaiSpeechModelId) =>
    new CambaiSpeechModel(modelId, {
      provider: `cambai.speech`,
      url: ({ path }) => `${baseURL}${path}`,
      headers: getHeaders,
      fetch: options.fetch,
    });

  const provider = function () {
    throw new NoSuchModelError({
      modelId: '',
      modelType: 'languageModel',
      message: 'Camb.ai does not provide language models',
    });
  };

  provider.specificationVersion = 'v3' as const;
  provider.transcription = createTranscriptionModel;
  provider.transcriptionModel = createTranscriptionModel;
  provider.speech = createSpeechModel;
  provider.speechModel = createSpeechModel;

  provider.languageModel = (modelId: string) => {
    throw new NoSuchModelError({
      modelId,
      modelType: 'languageModel',
      message: 'Camb.ai does not provide language models',
    });
  };

  provider.embeddingModel = (modelId: string) => {
    throw new NoSuchModelError({
      modelId,
      modelType: 'embeddingModel',
      message: 'Camb.ai does not provide embedding models',
    });
  };
  provider.textEmbeddingModel = provider.embeddingModel;

  provider.imageModel = (modelId: string) => {
    throw new NoSuchModelError({
      modelId,
      modelType: 'imageModel',
      message: 'Camb.ai does not provide image models',
    });
  };

  return provider as CambaiProvider;
}

/**
 * Default Camb.ai provider instance.
 */
export const cambai = createCambai();
