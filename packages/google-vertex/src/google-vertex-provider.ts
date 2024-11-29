import {
  LanguageModelV1,
  NoSuchModelError,
  ProviderV1,
} from '@ai-sdk/provider';
import {
  combineHeaders,
  FetchFunction,
  generateId,
  loadSetting,
} from '@ai-sdk/provider-utils';
import {
  GoogleVertexModelId,
  GoogleVertexSettings,
} from './google-vertex-settings';
import {
  GoogleVertexEmbeddingModelId,
  GoogleVertexEmbeddingSettings,
} from './google-vertex-embedding-settings';
import { GoogleVertexEmbeddingModel } from './google-vertex-embedding-model';
import { generateAuthTokenEdgeCompatible as generateAuthToken } from './google-vertex-auth-edge';
import { GoogleGenerativeAILanguageModel } from '@ai-sdk/google/internal';

export interface GoogleVertexProvider extends ProviderV1 {
  /**
Creates a model for text generation.
   */
  (
    modelId: GoogleVertexModelId,
    settings?: GoogleVertexSettings,
  ): LanguageModelV1;

  languageModel: (
    modelId: GoogleVertexModelId,
    settings?: GoogleVertexSettings,
  ) => LanguageModelV1;
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
Optional. The headers to use.
   */
  headers?: Record<string, string | undefined>;

  /**
Experimental: async function to return custom headers to include in the requests.
     */
  experimental_getHeadersAsync?: () => Promise<
    Record<string, string | undefined>
  >;

  /**
Custom fetch implementation. You can use it as a middleware to intercept requests,
or to provide a custom fetch implementation for e.g. testing.
    */
  fetch?: FetchFunction;

  // for testing
  generateId?: () => string;

  /**
 Optional. The Authentication options provided by google-auth-library.
Complete list of authentication options is documented in the
GoogleAuthOptions interface:
https://github.com/googleapis/google-auth-library-nodejs/blob/main/src/auth/googleauth.ts.
   */
  generateAuthToken?: () => Promise<string | null | undefined>;
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

  const getHeadersAsync = async () => ({
    Authorization: `Bearer ${await (options.generateAuthToken?.() ??
      generateAuthToken())}`,
    'Content-Type': 'application/json',
  });

  const getMergedAsyncHeaders = () =>
    options.experimental_getHeadersAsync
      ? async () =>
          combineHeaders(
            await getHeadersAsync(),
            await options.experimental_getHeadersAsync?.(),
          )
      : () => getHeadersAsync();

  const createChatModel = (
    modelId: GoogleVertexModelId,
    settings: GoogleVertexSettings = {},
  ) => {
    const region = loadVertexLocation();
    const project = loadVertexProject();
    return new GoogleGenerativeAILanguageModel(modelId, settings, {
      provider: `google.vertex.chat`,
      baseURL: `https://${region}-aiplatform.googleapis.com/v1/projects/${project}/locations/${region}/publishers/google`,
      headers: () => options.headers ?? {},
      experimental_getHeadersAsync: getMergedAsyncHeaders(),
      generateId: options.generateId ?? generateId,
      fetch: options.fetch,
    });
  };

  const createEmbeddingModel = (
    modelId: GoogleVertexEmbeddingModelId,
    settings: GoogleVertexEmbeddingSettings = {},
  ) =>
    new GoogleVertexEmbeddingModel(modelId, settings, {
      provider: `google.vertex.embedding`,
      region: loadVertexLocation(),
      project: loadVertexProject(),
      headers: () => options.headers ?? {},
      experimental_getHeadersAsync: getMergedAsyncHeaders(),
      generateAuthToken: options.generateAuthToken,
    });

  const provider = function (
    modelId: GoogleVertexModelId,
    settings?: GoogleVertexSettings,
  ) {
    if (new.target) {
      throw new Error(
        'The Google Vertex AI model function cannot be called with the new keyword.',
      );
    }

    return createChatModel(modelId, settings);
  };

  provider.languageModel = createChatModel;
  provider.textEmbeddingModel = createEmbeddingModel;

  return provider as GoogleVertexProvider;
}

/**
Default Google Vertex AI provider instance.
 */
export const vertex = createVertex();
