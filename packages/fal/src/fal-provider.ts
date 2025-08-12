import {
  ImageModelV2,
  NoSuchModelError,
  ProviderV2,
  SpeechModelV2,
  TranscriptionModelV2,
} from '@ai-sdk/provider';
import type { FetchFunction } from '@ai-sdk/provider-utils';
import { withoutTrailingSlash } from '@ai-sdk/provider-utils';
import { FalImageModel } from './fal-image-model';
import { FalImageModelId } from './fal-image-settings';
import { FalTranscriptionModelId } from './fal-transcription-options';
import { FalTranscriptionModel } from './fal-transcription-model';
import { FalSpeechModelId } from './fal-speech-settings';
import { FalSpeechModel } from './fal-speech-model';

export interface FalProviderSettings {
  /**
fal.ai API key. Default value is taken from the `FAL_API_KEY` environment
variable, falling back to `FAL_KEY`.
  */
  apiKey?: string;

  /**
Base URL for the API calls.
The default prefix is `https://fal.run`.
   */
  baseURL?: string;

  /**
Custom headers to include in the requests.
   */
  headers?: Record<string, string>;

  /**
Custom fetch implementation. You can use it as a middleware to intercept
requests, or to provide a custom fetch implementation for e.g. testing.
   */
  fetch?: FetchFunction;
}

export interface FalProvider extends ProviderV2 {
  /**
Creates a model for image generation.
   */
  image(modelId: FalImageModelId): ImageModelV2;

  /**
Creates a model for image generation.
   */
  imageModel(modelId: FalImageModelId): ImageModelV2;

  /**
Creates a model for transcription.
   */
  transcription(modelId: FalTranscriptionModelId): TranscriptionModelV2;

  /**
Creates a model for speech generation.
   */
  speech(modelId: FalSpeechModelId): SpeechModelV2;
}

const defaultBaseURL = 'https://fal.run';

function loadFalApiKey({
  apiKey,
  description = 'fal.ai',
}: {
  apiKey: string | undefined;
  description?: string;
}): string {
  if (typeof apiKey === 'string') {
    return apiKey;
  }

  if (apiKey != null) {
    throw new Error(`${description} API key must be a string.`);
  }

  if (typeof process === 'undefined') {
    throw new Error(
      `${description} API key is missing. Pass it using the 'apiKey' parameter. Environment variables are not supported in this environment.`,
    );
  }

  let envApiKey = process.env.FAL_API_KEY;
  if (envApiKey == null) {
    envApiKey = process.env.FAL_KEY;
  }

  if (envApiKey == null) {
    throw new Error(
      `${description} API key is missing. Pass it using the 'apiKey' parameter or set either the FAL_API_KEY or FAL_KEY environment variable.`,
    );
  }

  if (typeof envApiKey !== 'string') {
    throw new Error(
      `${description} API key must be a string. The value of the environment variable is not a string.`,
    );
  }

  return envApiKey;
}

/**
Create a fal.ai provider instance.
 */
export function createFal(options: FalProviderSettings = {}): FalProvider {
  const baseURL = withoutTrailingSlash(options.baseURL ?? defaultBaseURL);
  const getHeaders = () => ({
    Authorization: `Key ${loadFalApiKey({
      apiKey: options.apiKey,
    })}`,
    ...options.headers,
  });

  const createImageModel = (modelId: FalImageModelId) =>
    new FalImageModel(modelId, {
      provider: 'fal.image',
      baseURL: baseURL ?? defaultBaseURL,
      headers: getHeaders,
      fetch: options.fetch,
    });

  const createSpeechModel = (modelId: FalSpeechModelId) =>
    new FalSpeechModel(modelId, {
      provider: `fal.speech`,
      url: ({ path }) => path,
      headers: getHeaders,
      fetch: options.fetch,
    });

  const createTranscriptionModel = (modelId: FalTranscriptionModelId) =>
    new FalTranscriptionModel(modelId, {
      provider: `fal.transcription`,
      url: ({ path }) => path,
      headers: getHeaders,
      fetch: options.fetch,
    });

  return {
    imageModel: createImageModel,
    image: createImageModel,
    languageModel: () => {
      throw new NoSuchModelError({
        modelId: 'languageModel',
        modelType: 'languageModel',
      });
    },
    speech: createSpeechModel,
    textEmbeddingModel: () => {
      throw new NoSuchModelError({
        modelId: 'textEmbeddingModel',
        modelType: 'textEmbeddingModel',
      });
    },
    transcription: createTranscriptionModel,
  };
}

/**
Default fal.ai provider instance.
 */
export const fal = createFal();
