import {
  NoSuchModelError,
  type LanguageModelV4,
  type ProviderV4,
} from '@ai-sdk/provider';
import {
  loadApiKey,
  withoutTrailingSlash,
  withUserAgentSuffix,
  type FetchFunction,
} from '@ai-sdk/provider-utils';
import { BaiduChatLanguageModel } from './baidu-chat-language-model';
import type { BaiduChatModelId } from './baidu-chat-options';
import { VERSION } from './version';

export interface BaiduProviderSettings {
  apiKey?: string;
  baseURL?: string;
  headers?: Record<string, string>;
  fetch?: FetchFunction;
  includeUsage?: boolean;
}

export interface BaiduProvider extends ProviderV4 {
  (modelId: BaiduChatModelId): LanguageModelV4;
  chatModel(modelId: BaiduChatModelId): LanguageModelV4;
  languageModel(modelId: BaiduChatModelId): LanguageModelV4;
}

const defaultBaseURL = 'https://qianfan.baidubce.com/v2';

export function createBaidu(
  options: BaiduProviderSettings = {},
): BaiduProvider {
  const baseURL = withoutTrailingSlash(options.baseURL) ?? defaultBaseURL;
  const getHeaders = () =>
    withUserAgentSuffix(
      {
        Authorization: `Bearer ${loadApiKey({
          apiKey: options.apiKey,
          environmentVariableName: 'BAIDU_API_KEY',
          description: 'Baidu Qianfan API key',
        })}`,
        ...options.headers,
      },
      `ai-sdk/baidu/${VERSION}`,
    );

  const createChatModel = (modelId: BaiduChatModelId) => {
    return new BaiduChatLanguageModel(modelId, {
      provider: 'baidu.chat',
      baseURL,
      headers: getHeaders,
      fetch: options.fetch,
      includeUsage: options.includeUsage ?? true,
    });
  };

  const provider = (modelId: BaiduChatModelId) => createChatModel(modelId);

  provider.specificationVersion = 'v4' as const;
  provider.chatModel = createChatModel;
  provider.languageModel = createChatModel;
  provider.embeddingModel = (modelId: string) => {
    throw new NoSuchModelError({ modelId, modelType: 'embeddingModel' });
  };
  provider.imageModel = (modelId: string) => {
    throw new NoSuchModelError({ modelId, modelType: 'imageModel' });
  };

  return provider;
}

export const baidu = createBaidu();
