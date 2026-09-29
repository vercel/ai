import {
  NoSuchModelError,
  type LanguageModelV4,
  type ImageModelProviderV4,
  type TranscriptionModelProviderV4,
  type VideoModelProviderV4,
  type SpeechModelProviderV4,
  type EmbeddingModelProviderV4,
} from '@ai-sdk/provider';
import {
  withoutTrailingSlash,
  withUserAgentSuffix,
  type FetchFunction,
} from '@ai-sdk/provider-utils';
import { FalImageModel } from './fal-image-model';
import type { FalImageModelId } from './fal-image-settings';
import type { FalTranscriptionModelId } from './fal-transcription-options';
import { FalTranscriptionModel } from './fal-transcription-model';
import type { FalSpeechModelId } from './fal-speech-settings';
import { FalSpeechModel } from './fal-speech-model';
import { FalVideoModel } from './fal-video-model';
import type { FalVideoModelId } from './fal-video-settings';
import { VERSION } from './version';

export interface FalProviderSettings {
  /**
   * fal.ai API key. Default value is taken from the `FAL_API_KEY` environment
   * variable, falling back to `FAL_KEY`.
   */
  apiKey?: string;

  /**
   * Base URL for the API calls.
   * The default prefix is `https://fal.run`.
   */
  baseURL?: string;

  /**
   * Custom headers to include in the requests.
   */
  headers?: Record<string, string>;

  /**
   * Custom fetch implementation. You can use it as a middleware to intercept
   * requests, or to provide a custom fetch implementation for e.g. testing.
   */
  fetch?: FetchFunction;
}

export interface FalProvider
  extends
    ImageModelProviderV4<FalImageModelId>,
    TranscriptionModelProviderV4<FalTranscriptionModelId>,
    VideoModelProviderV4<FalVideoModelId>,
    SpeechModelProviderV4<FalSpeechModelId>,
    EmbeddingModelProviderV4 {
  languageModel(modelId: string): LanguageModelV4;

  /**
   * @deprecated Use `embeddingModel` instead.
   */
  textEmbeddingModel(modelId: string): never;
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
 * Create a fal.ai provider instance.
 */
export function createFal(options: FalProviderSettings = {}): FalProvider {
  const baseURL = withoutTrailingSlash(options.baseURL ?? defaultBaseURL);
  const getHeaders = () =>
    withUserAgentSuffix(
      {
        Authorization: `Key ${loadFalApiKey({
          apiKey: options.apiKey,
        })}`,
        ...options.headers,
      },
      `ai-sdk-fal/${VERSION}`,
    );

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

  const createVideoModel = (modelId: FalVideoModelId) =>
    new FalVideoModel(modelId, {
      provider: 'fal.video',
      url: ({ path }) => path,
      headers: getHeaders,
      fetch: options.fetch,
    });

  const embeddingModel = (modelId: string) => {
    throw new NoSuchModelError({
      modelId,
      modelType: 'embeddingModel',
    });
  };

  return {
    specificationVersion: 'v4' as const,
    imageModel: createImageModel,
    image: createImageModel,
    languageModel: (modelId: string) => {
      throw new NoSuchModelError({
        modelId,
        modelType: 'languageModel',
      });
    },
    speech: createSpeechModel,
    speechModel: createSpeechModel,
    embedding: embeddingModel,
    embeddingModel,
    textEmbeddingModel: embeddingModel,
    transcription: createTranscriptionModel,
    transcriptionModel: createTranscriptionModel,
    video: createVideoModel,
    videoModel: createVideoModel,
  };
}

/**
 * Default fal.ai provider instance.
 */
export const fal = createFal();
