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
import { GoogleGenerativeAILanguageModel } from '@ai-sdk/google/internal';
import { GoogleAuthOptions } from 'google-auth-library';
import { generateAuthToken } from './google-vertex-auth-google-auth-library';

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
Experimental: async function to return custom headers to include in the
requests. This can be used to add an authorization header generated in whatever
manner is appropriate for your use case and environment.

If this is provided, the legacy behavior using the `googleAuthOptions1 setting
and the `google-auth-library` to automatically generate an authorization header
will be disabled.
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
  googleAuthOptions?: GoogleAuthOptions;
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

  const getGoogleAuthLibraryHeaders = async (): Promise<
    Record<string, string | undefined>
  > => {
    // Use the google auth library only if the user isn't specifying their own
    // credentials via experimental_getHeadersAsync.
    if (options.experimental_getHeadersAsync) {
      return {};
    }

    return {
      Authorization: `Bearer ${await generateAuthToken(
        options.googleAuthOptions,
      )}`,
      'Content-Type': 'application/json',
    };
  };

  const getMergedAsyncHeaders = () =>
    options.experimental_getHeadersAsync
      ? async () =>
          combineHeaders(
            await getGoogleAuthLibraryHeaders(),
            await options.experimental_getHeadersAsync?.(),
          )
      : () => getGoogleAuthLibraryHeaders();

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
