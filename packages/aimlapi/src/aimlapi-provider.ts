import {
  OpenAICompatibleChatLanguageModel,
  OpenAICompatibleCompletionLanguageModel,
  OpenAICompatibleEmbeddingModel,
  ProviderErrorStructure,
} from '@ai-sdk/openai-compatible';
import { EmbeddingModelV1, ImageModelV1, LanguageModelV1, ProviderV1 } from '@ai-sdk/provider';
import { FetchFunction, loadApiKey, withoutTrailingSlash } from '@ai-sdk/provider-utils';
import { AIMLAPIErrorData, aimlapiErrorSchema } from './aimlapi-error';
import { AIMLAPIImageModelId, AimlapiImageSettings } from './aimlapi-image-settings';
import { AimlapiImageModel } from './aimlapi-image-model';

const aimlapiErrorStructure: ProviderErrorStructure<AIMLAPIErrorData> = {
  errorSchema: aimlapiErrorSchema,
  errorToMessage: data => data.error,
};

/**
 * Configuration settings for creating the AIMLAPI provider.
 */
export interface AIMLAPIProviderSettings {
  apiKey?: string;
  baseURL?: string;
  headers?: Record<string, string>;
  fetch?: FetchFunction;
}

/**
 * AIMLAPI provider interface supporting various model types.
 */
export interface AIMLAPIProvider extends ProviderV1 {
  (
    modelId: string,
    settings?: Record<string, any>,
  ): LanguageModelV1;

  chatModel(
    modelId: string,
    settings?: Record<string, any>,
  ): LanguageModelV1;

  completionModel(
    modelId: string,
    settings?: Record<string, any>,
  ): LanguageModelV1;

  languageModel(
    modelId: string,
    settings?: Record<string, any>,
  ): LanguageModelV1;

  textEmbeddingModel(
    modelId: string,
    settings?: Record<string, any>,
  ): EmbeddingModelV1<string>;

  imageModel?(
    modelId: string,
    settings?: Record<string, any>,
  ): ImageModelV1;
}

const defaultBaseURL = 'https://api.aimlapi.com/v1';

/**
 * Creates a new AIMLAPI provider instance using the given settings.
 */
export function createAIMLAPI(
  options: AIMLAPIProviderSettings = {},
): AIMLAPIProvider {
  const baseURL = withoutTrailingSlash(options.baseURL ?? defaultBaseURL);

  const getHeaders = () => ({
    Authorization: `Bearer ${loadApiKey({
      apiKey: options.apiKey,
      environmentVariableName: 'AIMLAPI_API_KEY',
      description: 'AIMLAPI API key',
    })}`,
    ...options.headers,
  });

  const getCommonConfig = (modelType: string) => ({
    provider: `aimlapi.${modelType}`,
    url: ({ path }: { path: string }) => `${baseURL}${path}`,
    headers: getHeaders,
    fetch: options.fetch,
    errorStructure: aimlapiErrorStructure,
  });

  const createChatModel = (modelId: string, settings: Record<string, any> = {}) =>
    new OpenAICompatibleChatLanguageModel(modelId, settings, {
      ...getCommonConfig('chat'),
      defaultObjectGenerationMode: 'json',
    });

  const createCompletionModel = (modelId: string, settings: Record<string, any> = {}) =>
    new OpenAICompatibleCompletionLanguageModel(modelId, settings, {
      ...getCommonConfig('completion'),
    });

  const createEmbeddingModel = (modelId: string, settings: Record<string, any> = {}) =>
    new OpenAICompatibleEmbeddingModel(modelId, settings, {
      ...getCommonConfig('embedding'),
    });

  const createImageModel = (
    modelId: AIMLAPIImageModelId,
    settings: AimlapiImageSettings = {},
  ) =>
    new AimlapiImageModel(modelId, settings, {
      ...getCommonConfig('image'),
      baseURL: baseURL ?? defaultBaseURL,
    });
  const provider = (modelId: string, settings?: Record<string, any>) =>
    createChatModel(modelId, settings);

  provider.chatModel = createChatModel;
  provider.completionModel = createCompletionModel;
  provider.languageModel = createChatModel;
  provider.textEmbeddingModel = createEmbeddingModel;
  provider.imageModel = createImageModel;

  return provider as AIMLAPIProvider;
}

/**
 * Default AIMLAPI provider instance using environment variable for the API key.
 * You can import and use it directly: `aimlapi.chat('gpt-4o')`
 */
export const aimlapi = createAIMLAPI();
