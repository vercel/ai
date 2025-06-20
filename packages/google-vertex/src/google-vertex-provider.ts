import { GoogleGenerativeAILanguageModel } from '@ai-sdk/google/internal';
import { ImageModelV2, LanguageModelV2, ProviderV2 } from '@ai-sdk/provider';
import {
  FetchFunction,
  generateId,
  loadSetting,
  Resolvable,
  withoutTrailingSlash,
} from '@ai-sdk/provider-utils';
import { GoogleVertexConfig } from './google-vertex-config';
import { GoogleVertexEmbeddingModel } from './google-vertex-embedding-model';
import { GoogleVertexEmbeddingModelId } from './google-vertex-embedding-options';
import { GoogleVertexImageModel } from './google-vertex-image-model';
import { GoogleVertexImageModelId } from './google-vertex-image-settings';
import { GoogleVertexModelId } from './google-vertex-options';

export interface GoogleVertexProvider extends ProviderV2 {
  /**
Creates a model for text generation.
   */
  (modelId: GoogleVertexModelId): LanguageModelV2;

  languageModel: (modelId: GoogleVertexModelId) => LanguageModelV2;

  /**
   * Creates a model for image generation.
   */
  image(modelId: GoogleVertexImageModelId): ImageModelV2;

  /**
Creates a model for image generation.
   */
  imageModel(modelId: GoogleVertexImageModelId): ImageModelV2;
}

export interface GoogleVertexProviderSettings {
  /**
Your Google Vertex location. Defaults to the environment variable `GOOGLE_VERTEX_LOCATION`.
   */
  location?: string;

  /**
Your Google Vertex project. Defaults to the environment variable `GOOGLE_VERTEX_PROJECT`.
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
Custom fetch implementation. You can use it as a middleware to intercept requests,
or to provide a custom fetch implementation for e.g. testing.
    */
  fetch?: FetchFunction;

  // for testing
  generateId?: () => string;

  /**
Base URL for the Google Vertex API calls.
     */
  baseURL?: string;
}

/**
Create a Google Vertex AI provider instance.
 */
export function createVertex(
  options: GoogleVertexProviderSettings = {},
): GoogleVertexProvider {
  const loadVertexProject = () =>
    loadSetting({
      settingValue: options.project,
      settingName: 'project',
      environmentVariableName: 'GOOGLE_VERTEX_PROJECT',
      description: 'Google Vertex project',
    });

  const loadVertexLocation = () =>
    loadSetting({
      settingValue: options.location,
      settingName: 'location',
      environmentVariableName: 'GOOGLE_VERTEX_LOCATION',
      description: 'Google Vertex location',
    });

  const loadBaseURL = () => {
    const region = loadVertexLocation();
    const project = loadVertexProject();

    // For global region, use aiplatform.googleapis.com directly
    // For other regions, use region-aiplatform.googleapis.com
    const baseHost = `${region === 'global' ? '' : region + '-'}aiplatform.googleapis.com`;

    return (
      withoutTrailingSlash(options.baseURL) ??
      `https://${baseHost}/v1/projects/${project}/locations/${region}/publishers/google`
    );
  };

  const createConfig = (name: string): GoogleVertexConfig => {
    return {
      provider: `google.vertex.${name}`,
      headers: options.headers ?? {},
      fetch: options.fetch,
      baseURL: loadBaseURL(),
    };
  };

  const createChatModel = (modelId: GoogleVertexModelId) => {
    return new GoogleGenerativeAILanguageModel(modelId, {
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
    new GoogleVertexImageModel(modelId, createConfig('image'));

  const provider = function (modelId: GoogleVertexModelId) {
    if (new.target) {
      throw new Error(
        'The Google Vertex AI model function cannot be called with the new keyword.',
      );
    }

    return createChatModel(modelId);
  };

  provider.languageModel = createChatModel;
  provider.textEmbeddingModel = createEmbeddingModel;
  provider.image = createImageModel;
  provider.imageModel = createImageModel;

  return provider;
}
