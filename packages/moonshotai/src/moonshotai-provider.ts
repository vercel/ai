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
import { MoonshotAIChatLanguageModel } from './moonshotai-chat-language-model';
import type { MoonshotAIChatModelId } from './moonshotai-chat-options';
import { VERSION } from './version';

export type { MoonshotAIErrorData } from './moonshotai-chat-api-types';

export interface MoonshotAIProviderSettings {
  /**
   * Moonshot API key. Default value is taken from the `MOONSHOT_API_KEY`
   * environment variable.
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
   * Custom fetch implementation. You can use it as a middleware to intercept requests,
   * or to provide a custom fetch implementation for e.g. testing.
   */
  fetch?: FetchFunction;
}

export interface MoonshotAIProvider extends ProviderV4 {
  /**
   * Creates a model for text generation.
   */
  (modelId: MoonshotAIChatModelId): LanguageModelV4;

  /**
   * Creates a chat model for text generation.
   */
  chatModel(modelId: MoonshotAIChatModelId): LanguageModelV4;

  /**
   * Creates a language model for text generation.
   */
  languageModel(modelId: MoonshotAIChatModelId): LanguageModelV4;
}

const defaultBaseURL = 'https://api.moonshot.ai/v1';

export function getModelStructuredOutputSupport(
  modelId: MoonshotAIChatModelId,
): boolean {
  return (
    modelId.startsWith('kimi-k') ||
    modelId === 'moonshot-v1-8k' ||
    modelId === 'moonshot-v1-32k' ||
    modelId === 'moonshot-v1-128k' ||
    modelId === 'moonshot-v1-auto' ||
    modelId === 'moonshot-v1-8k-vision-preview' ||
    modelId === 'moonshot-v1-32k-vision-preview' ||
    modelId === 'moonshot-v1-128k-vision-preview'
  );
}

export function createMoonshotAI(
  options: MoonshotAIProviderSettings = {},
): MoonshotAIProvider {
  const baseURL = withoutTrailingSlash(options.baseURL ?? defaultBaseURL);
  const getHeaders = () =>
    withUserAgentSuffix(
      {
        Authorization: `Bearer ${loadApiKey({
          apiKey: options.apiKey,
          environmentVariableName: 'MOONSHOT_API_KEY',
          description: 'Moonshot API key',
        })}`,
        ...options.headers,
      },
      `ai-sdk/moonshotai/${VERSION}`,
    );

  const createChatModel = (modelId: MoonshotAIChatModelId) => {
    return new MoonshotAIChatLanguageModel(modelId, {
      provider: 'moonshotai.chat',
      url: ({ path }) => `${baseURL}${path}`,
      headers: getHeaders,
      fetch: options.fetch,
      includeUsage: true,
      supportsStructuredOutputs: getModelStructuredOutputSupport(modelId),
    });
  };

  const provider = (modelId: MoonshotAIChatModelId) => createChatModel(modelId);

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

export const moonshotai = createMoonshotAI();
