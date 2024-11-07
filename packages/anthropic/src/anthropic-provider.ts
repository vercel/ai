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
import { AnthropicMessagesLanguageModel } from './anthropic-messages-language-model';
import {
  AnthropicMessagesModelId,
  AnthropicMessagesSettings,
} from './anthropic-messages-settings';
import { anthropicTools } from './anthropic-tools';

export interface AnthropicProvider extends ProviderV1 {
  /**
Creates a model for text generation.
*/
  (
    modelId: AnthropicMessagesModelId,
    settings?: AnthropicMessagesSettings,
  ): LanguageModelV1;

  /**
Creates a model for text generation.
*/
  languageModel(
    modelId: AnthropicMessagesModelId,
    settings?: AnthropicMessagesSettings,
  ): LanguageModelV1;

  /**
@deprecated Use `.languageModel()` instead.
*/
  chat(
    modelId: AnthropicMessagesModelId,
    settings?: AnthropicMessagesSettings,
  ): LanguageModelV1;

  /**
@deprecated Use `.languageModel()` instead.
   */
  messages(
    modelId: AnthropicMessagesModelId,
    settings?: AnthropicMessagesSettings,
  ): LanguageModelV1;

  /**
Anthropic-specific computer use tool.
   */
  tools: typeof anthropicTools;
}

export interface AnthropicProviderSettings {
  /**
Use a different URL prefix for API calls, e.g. to use proxy servers.
The default prefix is `https://api.anthropic.com/v1`.
   */
  baseURL?: string;

  /**
API key that is being send using the `x-api-key` header.
It defaults to the `ANTHROPIC_API_KEY` environment variable.
   */
  apiKey?: string;

  /**
Custom headers to include in the requests.
     */
  headers?: Record<string, string>;

  /**
Custom fetch implementation. You can use it as a middleware to intercept requests,
or to provide a custom fetch implementation for e.g. testing.
    */
  fetch?: FetchFunction;

  generateId?: () => string;
}

/**
Create an Anthropic provider instance.
 */
export function createAnthropic(
  options: AnthropicProviderSettings = {},
): AnthropicProvider {
  const baseURL =
    withoutTrailingSlash(options.baseURL) ?? 'https://api.anthropic.com/v1';

  const getHeaders = () => ({
    'anthropic-version': '2023-06-01',
    'x-api-key': loadApiKey({
      apiKey: options.apiKey,
      environmentVariableName: 'ANTHROPIC_API_KEY',
      description: 'Anthropic',
    }),
    ...options.headers,
  });

  const createChatModel = (
    modelId: AnthropicMessagesModelId,
    settings: AnthropicMessagesSettings = {},
  ) =>
    new AnthropicMessagesLanguageModel(modelId, settings, {
      provider: 'anthropic.messages',
      baseURL,
      headers: getHeaders,
      fetch: options.fetch,
    });

  const provider = function (
    modelId: AnthropicMessagesModelId,
    settings?: AnthropicMessagesSettings,
  ) {
    if (new.target) {
      throw new Error(
        'The Anthropic model function cannot be called with the new keyword.',
      );
    }

    return createChatModel(modelId, settings);
  };

  provider.languageModel = createChatModel;
  provider.chat = createChatModel;
  provider.messages = createChatModel;
  provider.textEmbeddingModel = (modelId: string) => {
    throw new NoSuchModelError({ modelId, modelType: 'textEmbeddingModel' });
  };

  provider.tools = anthropicTools;

  return provider as AnthropicProvider;
}

/**
Default Anthropic provider instance.
 */
export const anthropic = createAnthropic();
