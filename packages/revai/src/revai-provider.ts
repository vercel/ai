import {
  TranscriptionModelV3,
  ProviderV3,
  NoSuchModelError,
} from '@ai-sdk/provider';
import {
  FetchFunction,
  loadApiKey,
  withUserAgentSuffix,
} from '@ai-sdk/provider-utils';
import { RevaiTranscriptionModel } from './revai-transcription-model';
import { RevaiTranscriptionModelId } from './revai-transcription-options';
import { VERSION } from './version';

export interface RevaiProvider extends ProviderV3 {
  (
    modelId: 'machine',
    settings?: {},
  ): {
    transcription: RevaiTranscriptionModel;
  };

  /**
Creates a model for transcription.
   */
  transcription(modelId: RevaiTranscriptionModelId): TranscriptionModelV3;
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
  const getHeaders = () =>
    withUserAgentSuffix(
      {
        authorization: `Bearer ${loadApiKey({
          apiKey: options.apiKey,
          environmentVariableName: 'REVAI_API_KEY',
          description: 'Rev.ai',
        })}`,
        ...options.headers,
      },
      `ai-sdk/revai/${VERSION}`,
    );

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

  provider.languageModel = () => {
    throw new NoSuchModelError({
      modelId: 'unknown',
      modelType: 'languageModel',
      message: 'Rev.ai does not provide language models',
    });
  };

  provider.textEmbeddingModel = () => {
    throw new NoSuchModelError({
      modelId: 'unknown',
      modelType: 'textEmbeddingModel',
      message: 'Rev.ai does not provide text embedding models',
    });
  };

  provider.imageModel = () => {
    throw new NoSuchModelError({
      modelId: 'unknown',
      modelType: 'imageModel',
      message: 'Rev.ai does not provide image models',
    });
  };

  return provider as RevaiProvider;
}

/**
Default Rev.ai provider instance.
 */
export const revai = createRevai();
