import { LanguageModelV3 } from '@ai-sdk/provider';
import {
  OpenAICompatibleChatLanguageModel,
} from '@ai-sdk/openai-compatible';
import {
  FetchFunction,
  loadApiKey,
  withoutTrailingSlash,
} from '@ai-sdk/provider-utils';

import { BailingChatModelId } from './bailing-chat-settings';

export interface BailingProviderSettings {
  /**
   * Bailing API key.
   */
  apiKey?: string;

  /**
   * Base URL for the API calls.
   */
  baseURL?: string;

  /**
   * Custom headers to include in the requests.
   */
  headers?: Record<string, string>;

  /**
   * Optional custom url query parameters to include in request urls.
   */
  queryParams?: Record<string, string>;

  /**
   * Custom fetch implementation. You can use it as a middleware to intercept requests,
   * or to provide a custom fetch implementation for e.g. testing.
   */
  fetch?: FetchFunction;

  /**
   * Include usage information in streaming responses.
   */
  includeUsage?: boolean;

  /**
   * Whether the provider supports structured outputs in chat models.
   */
  supportsStructuredOutputs?: boolean;
}

export interface BailingProvider {
  /**
   * Creates a model for text generation.
   */
  (
    modelId: BailingChatModelId,
    settings?: BailingProviderSettings,
  ): LanguageModelV3;

  /**
   * Creates a chat model for text generation.
   */
  chatModel(
    modelId: BailingChatModelId,
    settings?: BailingProviderSettings,
  ): LanguageModelV3;
}

export function createBailing(
  options: BailingProviderSettings = {},
): BailingProvider {
  const baseURL = withoutTrailingSlash(
    options.baseURL ?? 'https://api.tbox.cn/api/llm/v1',
  );

  const getHeaders = () => ({
    Authorization: `Bearer ${loadApiKey({
      apiKey: options.apiKey,
      environmentVariableName: 'BAILING_API_KEY',
      description: 'Bailing API key',
    })}`,
    ...options.headers,
  });

  interface CommonModelConfig {
    provider: string;
    url: ({ path }: { path: string }) => string;
    headers: () => Record<string, string>;
    fetch?: FetchFunction;
  }

  const getCommonModelConfig = (modelType: string): CommonModelConfig => ({
    provider: `bailing.${modelType}`,
    url: ({ path }) => {
      const url = new URL(`${baseURL}${path}`);
      if (options.queryParams) {
        url.search = new URLSearchParams(options.queryParams).toString();
      }
      return url.toString();
    },
    headers: getHeaders,
    fetch: options.fetch,
  });

  const createChatModel = (
    modelId: BailingChatModelId,
    settings: BailingProviderSettings = {},
  ) => {
    return new OpenAICompatibleChatLanguageModel(
      modelId,
      {
        ...getCommonModelConfig('chat'),
        includeUsage: options.includeUsage ?? settings.includeUsage,
        supportsStructuredOutputs: options.supportsStructuredOutputs ?? settings.supportsStructuredOutputs,
      },
      {
        // Remove provider options schema for now to avoid zod import issues
      }
    );
  };

  const provider = (
    modelId: BailingChatModelId,
    settings?: BailingProviderSettings,
  ) => createChatModel(modelId, settings);

  provider.chatModel = createChatModel;

  return provider as BailingProvider;
}

// Export default instance
export const bailing = createBailing();

