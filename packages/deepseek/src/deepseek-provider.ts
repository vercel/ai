import { OpenAICompatibleChatLanguageModel } from '@ai-sdk/openai-compatible';
import {
  LanguageModelV1,
  NoSuchModelError,
  ProviderV1,
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
import {
  BaseUsageMetrics,
  ProviderUsageStructure,
  openaiCompatibleUsageSchema,
} from '@ai-sdk/openai-compatible';

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

const deepseekUsageSchema = openaiCompatibleUsageSchema.extend({
  prompt_cache_hit_tokens: z.number().nullish(),
  prompt_cache_miss_tokens: z.number().nullish(),
});

type DeepSeekUsageData = z.infer<typeof deepseekUsageSchema>;

interface DeepSeekUsageMetrics extends BaseUsageMetrics {
  promptCacheHitTokens: number;
  promptCacheMissTokens: number;
}

// see if we can use the schema rather than defining and using metrics here somehow
const deepseekUsageStructure: ProviderUsageStructure<
  DeepSeekUsageData,
  DeepSeekUsageMetrics
> = {
  usageSchema: deepseekUsageSchema,
  transformUsage: usage => {
    const promptTokens = usage?.prompt_tokens ?? 0;
    const completionTokens = usage?.completion_tokens ?? 0;
    return {
      promptTokens,
      completionTokens,
      totalTokens: promptTokens + completionTokens,
      promptCacheHitTokens: usage?.prompt_cache_hit_tokens ?? 0,
      promptCacheMissTokens: usage?.prompt_cache_miss_tokens ?? 0,
    };
  },
};

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
      usageStructure: deepseekUsageStructure,
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
