import {
  OpenAICompatibleChatLanguageModel,
  OpenAICompatibleCompletionLanguageModel,
  OpenAICompatibleEmbeddingModel,
} from '@ai-sdk/openai-compatible';
import {
  EmbeddingModelV3,
  ImageModelV3,
  LanguageModelV3,
  ProviderV3,
  RerankingModelV3,
} from '@ai-sdk/provider';
import {
  FetchFunction,
  loadApiKey,
  withoutTrailingSlash,
  withUserAgentSuffix,
} from '@ai-sdk/provider-utils';
import { TogetherAIRerankingModel } from './reranking/togetherai-reranking-model';
import { TogetherAIRerankingModelId } from './reranking/togetherai-reranking-options';
import { TogetherAIChatModelId } from './togetherai-chat-options';
import { TogetherAICompletionModelId } from './togetherai-completion-options';
import { TogetherAIEmbeddingModelId } from './togetherai-embedding-options';
import { TogetherAIImageModel } from './togetherai-image-model';
import { TogetherAIImageModelId } from './togetherai-image-settings';
import { VERSION } from './version';

export interface TogetherAIProviderSettings {
  /**
TogetherAI API key.
*/
  apiKey?: string;
  /**
Base URL for the API calls.
*/
  baseURL?: string;
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

export interface TogetherAIProvider extends ProviderV3 {
  /**
Creates a model for text generation.
*/
  (modelId: TogetherAIChatModelId): LanguageModelV3;

  /**
Creates a chat model for text generation.
*/
  chatModel(modelId: TogetherAIChatModelId): LanguageModelV3;

  /**
Creates a chat model for text generation.
*/
  languageModel(modelId: TogetherAIChatModelId): LanguageModelV3;

  /**
Creates a completion model for text generation.
*/
  completionModel(modelId: TogetherAICompletionModelId): LanguageModelV3;

  /**
Creates a text embedding model for text generation.
*/
  textEmbeddingModel(
    modelId: TogetherAIEmbeddingModelId,
  ): EmbeddingModelV3<string>;

  /**
Creates a model for image generation.
*/
  image(modelId: TogetherAIImageModelId): ImageModelV3;

  /**
Creates a model for image generation.
*/
  imageModel(modelId: TogetherAIImageModelId): ImageModelV3;

  /**
   * Creates a model for reranking.
   */
  reranking(modelId: TogetherAIRerankingModelId): RerankingModelV3;

  /**
   * Creates a model for reranking.
   */
  rerankingModel(modelId: TogetherAIRerankingModelId): RerankingModelV3;
}

export function createTogetherAI(
  options: TogetherAIProviderSettings = {},
): TogetherAIProvider {
  const baseURL = withoutTrailingSlash(
    options.baseURL ?? 'https://api.together.xyz/v1/',
  );
  const getHeaders = () =>
    withUserAgentSuffix(
      {
        Authorization: `Bearer ${loadApiKey({
          apiKey: options.apiKey,
          environmentVariableName: 'TOGETHER_AI_API_KEY',
          description: 'TogetherAI',
        })}`,
        ...options.headers,
      },
      `ai-sdk/togetherai/${VERSION}`,
    );

  interface CommonModelConfig {
    provider: string;
    url: ({ path }: { path: string }) => string;
    headers: () => Record<string, string>;
    fetch?: FetchFunction;
  }

  const getCommonModelConfig = (modelType: string): CommonModelConfig => ({
    provider: `togetherai.${modelType}`,
    url: ({ path }) => `${baseURL}${path}`,
    headers: getHeaders,
    fetch: options.fetch,
  });

  const createChatModel = (modelId: TogetherAIChatModelId) => {
    return new OpenAICompatibleChatLanguageModel(
      modelId,
      getCommonModelConfig('chat'),
    );
  };

  const createCompletionModel = (modelId: TogetherAICompletionModelId) =>
    new OpenAICompatibleCompletionLanguageModel(
      modelId,
      getCommonModelConfig('completion'),
    );

  const createTextEmbeddingModel = (modelId: TogetherAIEmbeddingModelId) =>
    new OpenAICompatibleEmbeddingModel(
      modelId,
      getCommonModelConfig('embedding'),
    );

  const createImageModel = (modelId: TogetherAIImageModelId) =>
    new TogetherAIImageModel(modelId, {
      ...getCommonModelConfig('image'),
      baseURL: baseURL ?? 'https://api.together.xyz/v1/',
    });

  const createRerankingModel = (modelId: TogetherAIRerankingModelId) =>
    new TogetherAIRerankingModel(modelId, {
      ...getCommonModelConfig('reranking'),
      baseURL: baseURL ?? 'https://api.together.xyz/v1/',
    });

  const provider = (modelId: TogetherAIChatModelId) => createChatModel(modelId);

  provider.specificationVersion = 'v3' as const;
  provider.completionModel = createCompletionModel;
  provider.languageModel = createChatModel;
  provider.chatModel = createChatModel;
  provider.textEmbeddingModel = createTextEmbeddingModel;
  provider.image = createImageModel;
  provider.imageModel = createImageModel;
  provider.reranking = createRerankingModel;
  provider.rerankingModel = createRerankingModel;

  return provider;
}

export const togetherai = createTogetherAI();
