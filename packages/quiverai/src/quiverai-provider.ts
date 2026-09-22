import {
  NoSuchModelError,
  type ImageModelV4,
  type LanguageModelV4,
  type ProviderV4,
} from '@ai-sdk/provider';
import { createOpenResponses } from '@ai-sdk/open-responses';
import {
  loadApiKey,
  loadOptionalSetting,
  withoutTrailingSlash,
  withUserAgentSuffix,
  type FetchFunction,
} from '@ai-sdk/provider-utils';
import { QuiverAIImageModel } from './quiverai-image-model';
import type { QuiverAIImageModelId } from './quiverai-image-settings';
import type { QuiverAILanguageModelId } from './quiverai-language-model-settings';
import { VERSION } from './version';

export interface QuiverAIProviderSettings {
  /**
   * QuiverAI API key. Default value is taken from the `QUIVERAI_API_KEY`
   * environment variable.
   */
  apiKey?: string;

  /**
   * Base URL for the API calls. Defaults to `https://api.quiver.ai/v1` and
   * falls back to the `QUIVERAI_BASE_URL` environment variable.
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

export interface QuiverAIProvider extends ProviderV4 {
  /**
   * Creates a language model for the QuiverAI Responses API.
   */
  (modelId: QuiverAILanguageModelId): LanguageModelV4;

  /**
   * Creates a language model for the QuiverAI Responses API.
   */
  languageModel(modelId: QuiverAILanguageModelId): LanguageModelV4;

  /**
   * Creates a model for image generation.
   */
  image(modelId: QuiverAIImageModelId): ImageModelV4;

  /**
   * Creates a model for image generation.
   */
  imageModel(modelId: QuiverAIImageModelId): ImageModelV4;

  /**
   * @deprecated Use `embeddingModel` instead.
   */
  textEmbeddingModel(modelId: string): never;

  /**
   * QuiverAI caller-executed tools.
   */
  tools: ReturnType<typeof createOpenResponses>['tools'];
}

const defaultBaseURL = 'https://api.quiver.ai/v1';

export function createQuiverAI(
  options: QuiverAIProviderSettings = {},
): QuiverAIProvider {
  const baseURL =
    withoutTrailingSlash(
      loadOptionalSetting({
        settingValue: options.baseURL,
        environmentVariableName: 'QUIVERAI_BASE_URL',
      }),
    ) ?? defaultBaseURL;

  const getHeaders = () => ({
    Authorization: `Bearer ${loadApiKey({
      apiKey: options.apiKey,
      environmentVariableName: 'QUIVERAI_API_KEY',
      description: 'QuiverAI',
    })}`,
    ...options.headers,
  });

  const getImageHeaders = () =>
    withUserAgentSuffix(getHeaders(), `ai-sdk/quiverai/${VERSION}`);

  const responsesProvider = createOpenResponses({
    name: 'quiverai',
    url: `${baseURL}/responses`,
    headers: getHeaders,
    fetch: options.fetch,
    strictResponseInput: true,
    customToolId: 'quiverai.custom',
    reasoningReplay: 'id-and-summary',
    structuredOutputs: false,
    supportedReasoningEfforts: ['low', 'medium', 'high', 'xhigh'],
    supportedReasoningSummaries: ['auto'],
    userAgentSuffix: `ai-sdk/quiverai/${VERSION}`,
  });

  const createLanguageModel = (modelId: QuiverAILanguageModelId) =>
    responsesProvider.languageModel(modelId);

  const createImageModel = (modelId: QuiverAIImageModelId) =>
    new QuiverAIImageModel(modelId, {
      provider: 'quiverai.image',
      baseURL,
      headers: getImageHeaders,
      fetch: options.fetch,
    });

  const embeddingModel = (modelId: string) => {
    throw new NoSuchModelError({
      modelId,
      modelType: 'embeddingModel',
    });
  };

  const provider = function (modelId: QuiverAILanguageModelId) {
    return createLanguageModel(modelId);
  };

  provider.specificationVersion = 'v4' as const;
  provider.languageModel = createLanguageModel;
  provider.image = createImageModel;
  provider.imageModel = createImageModel;
  provider.embeddingModel = embeddingModel;
  provider.textEmbeddingModel = embeddingModel;
  provider.tools = responsesProvider.tools;

  return provider as QuiverAIProvider;
}

export const quiverai = createQuiverAI();
