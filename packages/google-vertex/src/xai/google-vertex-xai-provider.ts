import {
  NoSuchModelError,
  type LanguageModelV2,
  type LanguageModelV2Usage,
  type ProviderV2,
} from '@ai-sdk/provider';
import {
  createOpenAICompatible,
  type OpenAICompatibleProvider,
} from '@ai-sdk/openai-compatible';
import {
  loadOptionalSetting,
  loadSetting,
  withoutTrailingSlash,
  type FetchFunction,
  type Resolvable,
} from '@ai-sdk/provider-utils';
import type { GoogleVertexXaiModelId } from './google-vertex-xai-options';

export interface GoogleVertexXaiProvider extends ProviderV2 {
  /**
   * Creates a model for text generation.
   */
  (modelId: GoogleVertexXaiModelId): LanguageModelV2;

  /**
   * Creates a model for text generation.
   */
  languageModel(modelId: GoogleVertexXaiModelId): LanguageModelV2;

  /**
   * Creates a chat model for text generation.
   */
  chatModel(modelId: GoogleVertexXaiModelId): LanguageModelV2;

  /**
   * Creates a text embedding model.
   */
  textEmbeddingModel(modelId: string): never;
}

export interface GoogleVertexXaiProviderSettings {
  /**
   * Google Cloud project ID. Defaults to the value of the `GOOGLE_VERTEX_PROJECT` environment variable.
   */
  project?: string;

  /**
   * Google Cloud location/region. Defaults to the value of the `GOOGLE_VERTEX_LOCATION` environment variable.
   * Use 'global' for the global endpoint.
   */
  location?: string;

  /**
   * Base URL for the API calls. If not provided, will be constructed from project and location.
   */
  baseURL?: string;

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
}

type GoogleVertexXaiUsage =
  | {
      prompt_tokens?: number | null;
      completion_tokens?: number | null;
      total_tokens?: number | null;
      prompt_tokens_details?: {
        cached_tokens?: number | null;
      } | null;
      completion_tokens_details?: {
        reasoning_tokens?: number | null;
      } | null;
    }
  | undefined
  | null;

function convertGoogleVertexXaiUsage(
  usage: GoogleVertexXaiUsage,
): LanguageModelV2Usage {
  if (usage == null) {
    return {
      inputTokens: undefined,
      outputTokens: undefined,
      totalTokens: undefined,
      reasoningTokens: undefined,
      cachedInputTokens: undefined,
    };
  }

  const promptTokens = usage.prompt_tokens ?? undefined;
  const completionTokens = usage.completion_tokens ?? undefined;
  const cachedInputTokens =
    usage.prompt_tokens_details?.cached_tokens ?? undefined;
  const reasoningTokens =
    usage.completion_tokens_details?.reasoning_tokens ?? undefined;
  const outputTokens =
    completionTokens == null && reasoningTokens == null
      ? undefined
      : (completionTokens ?? 0) + (reasoningTokens ?? 0);

  return {
    inputTokens: promptTokens,
    outputTokens,
    totalTokens: usage.total_tokens ?? undefined,
    reasoningTokens,
    cachedInputTokens,
  };
}

function transformGoogleVertexXaiRequestBody(args: Record<string, any>) {
  const transformedArgs = { ...args };
  delete transformedArgs.reasoning_effort;
  return transformedArgs;
}

/**
 * Create a Google Vertex AI xAI provider instance.
 * Uses the OpenAI-compatible Chat Completions API for Grok partner models.
 *
 * @see https://cloud.google.com/vertex-ai/generative-ai/docs/partner-models/grok
 */
export function createGoogleVertexXai(
  options: GoogleVertexXaiProviderSettings = {},
): GoogleVertexXaiProvider {
  const loadLocation = () =>
    loadOptionalSetting({
      settingValue: options.location,
      environmentVariableName: 'GOOGLE_VERTEX_LOCATION',
    });

  const loadProject = () =>
    loadSetting({
      settingValue: options.project,
      settingName: 'project',
      environmentVariableName: 'GOOGLE_VERTEX_PROJECT',
      description: 'Google Vertex project',
    });

  const constructBaseURL = () => {
    const projectId = loadProject();
    const location = loadLocation() ?? 'global';

    return `https://aiplatform.googleapis.com/v1/projects/${projectId}/locations/${location}/endpoints/openapi`;
  };

  const loadBaseURL = () =>
    withoutTrailingSlash(options.baseURL ?? '') || constructBaseURL();

  let cachedProvider:
    | OpenAICompatibleProvider<GoogleVertexXaiModelId, string, string, string>
    | undefined;
  const getProvider = () =>
    (cachedProvider ??= createOpenAICompatible({
      name: 'googleVertex.xai',
      baseURL: loadBaseURL(),
      fetch: options.fetch,
      includeUsage: true,
      supportsStructuredOutputs: true,
      supportedUrls: () => ({
        'image/*': [/^https?:\/\/.*$/],
      }),
      transformRequestBody: transformGoogleVertexXaiRequestBody,
      convertUsage: convertGoogleVertexXaiUsage,
    }));

  const createChatModel = (modelId: GoogleVertexXaiModelId) =>
    getProvider().languageModel(modelId);

  const provider = function (modelId: GoogleVertexXaiModelId) {
    if (new.target) {
      throw new Error(
        'The Google Vertex xAI model function cannot be called with the new keyword.',
      );
    }

    return createChatModel(modelId);
  };

  provider.specificationVersion = 'v2' as const;
  provider.languageModel = createChatModel;
  provider.chatModel = (modelId: GoogleVertexXaiModelId) =>
    getProvider().chatModel(modelId);
  provider.textEmbeddingModel = (modelId: string): never => {
    throw new NoSuchModelError({ modelId, modelType: 'textEmbeddingModel' });
  };
  provider.imageModel = (modelId: string): never => {
    throw new NoSuchModelError({ modelId, modelType: 'imageModel' });
  };

  return provider;
}
