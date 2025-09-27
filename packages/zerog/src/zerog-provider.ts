import {
  LanguageModelV3,
  ProviderV3,
} from '@ai-sdk/provider';
import {
  FetchFunction,
  withoutTrailingSlash,
  withUserAgentSuffix,
} from '@ai-sdk/provider-utils';
import {
  ZeroGChatConfig,
  ZeroGChatLanguageModel,
} from './chat/zerog-chat-language-model';
import { ZeroGChatModelId } from './chat/zerog-chat-options';
import { VERSION } from './version';

export interface ZeroGProvider extends ProviderV3 {
  (modelId: ZeroGChatModelId): LanguageModelV3;

  languageModel(
    modelId: ZeroGChatModelId,
    config?: Partial<ZeroGChatConfig>,
  ): LanguageModelV3;

  chatModel(modelId: ZeroGChatModelId): LanguageModelV3;
}

export interface ZeroGProviderSettings {
  /**
   * 0G Compute broker instance for authentication and service discovery.
   * This is required for proper authentication with the 0G network.
   */
  broker: any;

  /**
   * Provider address for the specific model service.
   * This can be obtained from the broker's service discovery.
   */
  providerAddress?: string;

  /**
   * Base URL for the API calls. If not provided, will be obtained from broker.
   */
  baseURL?: string;

  /**
   * Custom fetch implementation. You can use it as a middleware to intercept requests,
   * or to provide a custom fetch implementation for e.g. testing.
   */
  fetch?: FetchFunction;

  /**
   * Custom headers to include in requests.
   */
  headers?: Record<string, string>;
}

/**
 * Create a 0G Compute provider instance.
 */
export function createZeroG(
  options: ZeroGProviderSettings,
): ZeroGProvider {
  const { broker, providerAddress, baseURL, fetch, headers = {} } = options;

  if (!broker) {
    throw new Error('0G Compute broker is required. Please provide a broker instance.');
  }

  const getCommonModelConfig = (modelType: string): Omit<ZeroGChatConfig, 'provider'> => ({
    url: ({ path }) => {
      if (baseURL) {
        return `${withoutTrailingSlash(baseURL)}${path}`;
      }
      // If no baseURL provided, we'll need to get it from the broker
      throw new Error('Base URL must be provided or obtained from broker service metadata');
    },
    headers: () => withUserAgentSuffix(headers, `ai-sdk/zerog/${VERSION}`),
    fetch,
    broker,
    providerAddress,
  });

  const createLanguageModel = (modelId: ZeroGChatModelId) =>
    createChatModel(modelId);

  const createChatModel = (modelId: ZeroGChatModelId, config?: Partial<ZeroGChatConfig>) =>
    new ZeroGChatLanguageModel(modelId, {
      provider: `zerog.chat`,
      ...getCommonModelConfig('chat'),
      ...config,
    });

  const provider = (modelId: ZeroGChatModelId) => createLanguageModel(modelId);

  provider.languageModel = createLanguageModel;
  provider.chatModel = createChatModel;

  return provider as ZeroGProvider;
}

/**
 * Default 0G Compute provider instance. You need to configure it with your broker.
 */
export const zerog = (options: ZeroGProviderSettings) => createZeroG(options);
