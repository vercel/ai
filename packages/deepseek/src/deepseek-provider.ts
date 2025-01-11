import { OpenAICompatibleChatLanguageModel } from '@ai-sdk/openai-compatible';
import {
  LanguageModelV1,
  NoSuchModelError,
  ProviderV1,
  LanguageModelV1ProviderMetadata,
} from '@ai-sdk/provider';
import {
  FetchFunction,
  loadApiKey,
  withoutTrailingSlash,
} from '@ai-sdk/provider-utils';
import {
  DeepSeekChatModelId,
  DeepSeekChatSettings,
} from './deepseek-chat-settings';
import { z } from 'zod';

export interface DeepSeekProviderSettings {
  /**
DeepSeek API key.
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

export interface DeepSeekProvider extends ProviderV1 {
  /**
Creates a DeepSeek model for text generation.
*/
  (
    modelId: DeepSeekChatModelId,
    settings?: DeepSeekChatSettings,
  ): LanguageModelV1;

  /**
Creates a DeepSeek model for text generation.
*/
  languageModel(
    modelId: DeepSeekChatModelId,
    settings?: DeepSeekChatSettings,
  ): LanguageModelV1;

  /**
Creates a DeepSeek chat model for text generation.
*/
  chat(
    modelId: DeepSeekChatModelId,
    settings?: DeepSeekChatSettings,
  ): LanguageModelV1;
}

export function createDeepSeek(
  options: DeepSeekProviderSettings = {},
): DeepSeekProvider {
  const baseURL = withoutTrailingSlash(
    options.baseURL ?? 'https://api.deepseek.com/v1',
  );
  const getHeaders = () => ({
    Authorization: `Bearer ${loadApiKey({
      apiKey: options.apiKey,
      environmentVariableName: 'DEEPSEEK_API_KEY',
      description: 'DeepSeek API key',
    })}`,
    ...options.headers,
  });

  const createLanguageModel = (
    modelId: DeepSeekChatModelId,
    settings: DeepSeekChatSettings = {},
  ) => {
    return new OpenAICompatibleChatLanguageModel(modelId, settings, {
      provider: `deepseek.chat`,
      url: ({ path }) => `${baseURL}${path}`,
      headers: getHeaders,
      fetch: options.fetch,
      defaultObjectGenerationMode: 'json',
      usageStructure: z
        .object({
          prompt_tokens: z.number().nullish(),
          completion_tokens: z.number().nullish(),
          prompt_cache_hit_tokens: z.number().nullish(),
          prompt_cache_miss_tokens: z.number().nullish(),
        })
        .nullish(),
      getProviderMetadata(value: any, _cur: LanguageModelV1ProviderMetadata | undefined) {
        if (value?.usage?.prompt_cache_hit_tokens != null) {
          return {
            deepseek: {
              promptCacheHitTokens: value.usage
                .prompt_cache_hit_tokens,
              promptCacheMissTokens: value.usage
                .prompt_cache_miss_tokens,
            },
          };
        } else {
          return undefined;
        }
      },
    });
  };

  const provider = (
    modelId: DeepSeekChatModelId,
    settings?: DeepSeekChatSettings,
  ) => createLanguageModel(modelId, settings);

  provider.languageModel = createLanguageModel;
  provider.chat = createLanguageModel;
  provider.textEmbeddingModel = (modelId: string) => {
    throw new NoSuchModelError({ modelId, modelType: 'textEmbeddingModel' });
  };

  return provider as DeepSeekProvider;
}

export const deepseek = createDeepSeek();
