import {
  GoogleLanguageModel,
  GoogleSpeechModel,
} from '@ai-sdk/google/internal';
import type {
  Experimental_VideoModelV4,
  ImageModelV4,
  LanguageModelV4,
  ProviderV4,
  SpeechModelV4,
  TranscriptionModelV4,
} from '@ai-sdk/provider';
import {
  generateId,
  loadOptionalSetting,
  loadSetting,
  normalizeHeaders,
  resolve,
  withoutTrailingSlash,
  withUserAgentSuffix,
  type FetchFunction,
  type Resolvable,
} from '@ai-sdk/provider-utils';
import { VERSION } from './version';
import type { GoogleVertexConfig } from './google-vertex-config';
import { GoogleVertexEmbeddingModel } from './google-vertex-embedding-model';
import type { GoogleVertexEmbeddingModelId } from './google-vertex-embedding-model-options';
import { GoogleVertexImageModel } from './google-vertex-image-model';
import type { GoogleVertexImageModelId } from './google-vertex-image-settings';
import type { GoogleVertexModelId } from './google-vertex-options';
import { googleVertexTools } from './google-vertex-tools';
import { GoogleVertexTranscriptionModel } from './google-vertex-transcription-model';
import type { GoogleVertexTranscriptionModelId } from './google-vertex-transcription-model-options';
import { GoogleVertexVideoModel } from './google-vertex-video-model';
import type { GoogleVertexVideoModelId } from './google-vertex-video-settings';
import type { GoogleVertexSpeechModelId } from './google-vertex-speech-model-options';

const EXPRESS_MODE_BASE_URL =
  'https://aiplatform.googleapis.com/v1/publishers/google';

// set `x-goog-api-key` header to API key for express mode
function createExpressModeFetch(
  apiKey: string,
  customFetch?: FetchFunction,
): FetchFunction {
  return async (url, init) => {
    const modifiedInit: RequestInit = {
      ...init,
      headers: {
        ...(init?.headers ? normalizeHeaders(init.headers) : {}),
        'x-goog-api-key': apiKey,
      },
    };
    return (customFetch ?? fetch)(url.toString(), modifiedInit);
  };
}

export interface GoogleVertexProvider extends ProviderV4 {
  /**
   * Creates a model for text generation.
   */
  (modelId: GoogleVertexModelId): LanguageModelV4;

  languageModel: (modelId: GoogleVertexModelId) => LanguageModelV4;

  /**
   * Creates a model for image generation.
   */
  image(modelId: GoogleVertexImageModelId): ImageModelV4;

  /**
   * Creates a model for image generation.
   */
  imageModel(modelId: GoogleVertexImageModelId): ImageModelV4;

  tools: typeof googleVertexTools;

  /**
   * @deprecated Use `embeddingModel` instead.
   */
  textEmbeddingModel(
    modelId: GoogleVertexEmbeddingModelId,
  ): GoogleVertexEmbeddingModel;

  /**
   * Creates a model for video generation.
   */
  video(modelId: GoogleVertexVideoModelId): Experimental_VideoModelV4;

  /**
   * Creates a model for video generation.
   */
  videoModel(modelId: GoogleVertexVideoModelId): Experimental_VideoModelV4;

  /**
   * Creates a model for speech generation (text-to-speech).
   */
  speech(modelId: GoogleVertexSpeechModelId): SpeechModelV4;

  /**
   * Creates a model for speech generation (text-to-speech).
   */
  speechModel(modelId: GoogleVertexSpeechModelId): SpeechModelV4;

  /**
   * Creates a model for transcription (speech-to-text).
   */
  transcription(
    modelId: GoogleVertexTranscriptionModelId,
  ): TranscriptionModelV4;

  /**
   * Creates a model for transcription (speech-to-text).
   */
  transcriptionModel(
    modelId: GoogleVertexTranscriptionModelId,
  ): TranscriptionModelV4;
}

export interface GoogleVertexProviderSettings {
  /**
   * Optional. The API key for the Google Cloud project. If provided, the
   * provider will use express mode with API key authentication. Defaults to
   * the value of the `GOOGLE_VERTEX_API_KEY` environment variable.
   */
  apiKey?: string;

  /**
   * Your Google Vertex location. Defaults to the environment variable `GOOGLE_VERTEX_LOCATION`.
   */
  location?: string;

  /**
   * Your Google Vertex project. Defaults to the environment variable `GOOGLE_VERTEX_PROJECT`.
   */
  project?: string;

  /**
   * Headers to use for requests. Can be:
   * - A headers object
   * - A Promise that resolves to a headers object
   * - A function that returns a headers object
   * - A function that returns a Promise of a headers object
   */
  headers?: Resolvable<Record<string, string | undefined>>;

  /**
   * Custom fetch implementation. You can use it as a middleware to intercept requests,
   * or to provide a custom fetch implementation for e.g. testing.
   */
  fetch?: FetchFunction;

  // for testing
  generateId?: () => string;

  /**
   * Base URL for the Google Vertex API calls.
   */
  baseURL?: string;
}

/**
 * Create a Google Vertex AI provider instance.
 */
export function createGoogleVertex(
  options: GoogleVertexProviderSettings = {},
): GoogleVertexProvider {
  const apiKey = loadOptionalSetting({
    settingValue: options.apiKey,
    environmentVariableName: 'GOOGLE_VERTEX_API_KEY',
  });

  const loadGoogleVertexProject = () =>
    loadSetting({
      settingValue: options.project,
      settingName: 'project',
      environmentVariableName: 'GOOGLE_VERTEX_PROJECT',
      description: 'Google Vertex project',
    });

  const loadGoogleVertexLocation = () =>
    loadSetting({
      settingValue: options.location,
      settingName: 'location',
      environmentVariableName: 'GOOGLE_VERTEX_LOCATION',
      description: 'Google Vertex location',
    });

  const loadBaseURL = () => {
    if (apiKey) {
      return withoutTrailingSlash(options.baseURL) ?? EXPRESS_MODE_BASE_URL;
    }

    const region = loadGoogleVertexLocation();
    const project = loadGoogleVertexProject();

    const getHost = () => {
      if (region === 'global') {
        return 'aiplatform.googleapis.com';
      } else if (region === 'eu' || region === 'us') {
        return `aiplatform.${region}.rep.googleapis.com`;
      } else {
        return `${region}-aiplatform.googleapis.com`;
      }
    };

    return (
      withoutTrailingSlash(options.baseURL) ??
      `https://${getHost()}/v1beta1/projects/${project}/locations/${region}/publishers/google`
    );
  };

  const createConfig = (name: string): GoogleVertexConfig => {
    const getHeaders = async () => {
      const originalHeaders = await resolve(options.headers ?? {});
      return withUserAgentSuffix(
        originalHeaders,
        `ai-sdk/google-vertex/${VERSION}`,
      );
    };

    return {
      provider: `google.vertex.${name}`,
      headers: getHeaders,
      fetch: apiKey
        ? createExpressModeFetch(apiKey, options.fetch)
        : options.fetch,
      baseURL: loadBaseURL(),
    };
  };

  const createChatModel = (modelId: GoogleVertexModelId) => {
    return new GoogleLanguageModel(modelId, {
      ...createConfig('chat'),
      generateId: options.generateId ?? generateId,
      supportedUrls: () => ({
        '*': [
          // HTTP URLs:
          /^https?:\/\/.*$/,
          // Google Cloud Storage URLs:
          /^gs:\/\/.*$/,
        ],
      }),
    });
  };

  const createEmbeddingModel = (modelId: GoogleVertexEmbeddingModelId) =>
    new GoogleVertexEmbeddingModel(modelId, createConfig('embedding'));

  const createImageModel = (modelId: GoogleVertexImageModelId) =>
    new GoogleVertexImageModel(modelId, {
      ...createConfig('image'),
      generateId: options.generateId ?? generateId,
    });

  const createVideoModel = (modelId: GoogleVertexVideoModelId) =>
    new GoogleVertexVideoModel(modelId, {
      ...createConfig('video'),
      generateId: options.generateId ?? generateId,
    });

  const createSpeechModel = (modelId: GoogleVertexSpeechModelId) =>
    new GoogleSpeechModel(modelId, createConfig('speech'));

  // Cloud Speech-to-Text reuses the Vertex auth headers from createConfig, but
  // targets the Speech-to-Text API.
  const createTranscriptionModel = (
    modelId: GoogleVertexTranscriptionModelId,
  ) => {
    if (apiKey) {
      throw new Error(
        'Google Vertex transcription models do not support Express Mode API keys. Use standard Google Cloud credentials instead.',
      );
    }

    const config = createConfig('transcription');
    return new GoogleVertexTranscriptionModel(modelId, {
      provider: config.provider,
      headers: config.headers,
      fetch: config.fetch,
      project: loadGoogleVertexProject(),
      location: loadGoogleVertexLocation(),
    });
  };

  const provider = function (modelId: GoogleVertexModelId) {
    if (new.target) {
      throw new Error(
        'The Google Vertex AI model function cannot be called with the new keyword.',
      );
    }

    return createChatModel(modelId);
  };

  provider.specificationVersion = 'v4' as const;
  provider.languageModel = createChatModel;
  provider.embeddingModel = createEmbeddingModel;
  provider.textEmbeddingModel = createEmbeddingModel;
  provider.image = createImageModel;
  provider.imageModel = createImageModel;
  provider.video = createVideoModel;
  provider.videoModel = createVideoModel;
  provider.speech = createSpeechModel;
  provider.speechModel = createSpeechModel;
  provider.transcription = createTranscriptionModel;
  provider.transcriptionModel = createTranscriptionModel;
  provider.tools = googleVertexTools;

  return provider;
}
