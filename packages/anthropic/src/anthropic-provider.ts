import {
  JSONValue,
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
import { z } from 'zod';

const Bash20241022Parameters = z.object({
  command: z.string(),
  restart: z.boolean().nullish(),
});

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

  tools: {
    bash_20241022: (options: {
      execute?: (
        args: z.infer<typeof Bash20241022Parameters>,
        options: { abortSignal?: AbortSignal },
      ) => Promise<JSONValue>;
    }) => {
      type: 'provider-defined';
      id: 'anthropic.bash_20241022';
      args: {};
      parameters: typeof Bash20241022Parameters;
      execute?:
        | undefined
        | ((
            args: z.infer<typeof Bash20241022Parameters>,
            options: { abortSignal?: AbortSignal },
          ) => Promise<JSONValue>);
    };
  };
}

export interface AnthropicProviderSettings {
  /**
Use a different URL prefix for API calls, e.g. to use proxy servers.
The default prefix is `https://api.anthropic.com/v1`.
   */
  baseURL?: string;

  /**
@deprecated Use `baseURL` instead.
   */
  baseUrl?: string;

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
    withoutTrailingSlash(options.baseURL ?? options.baseUrl) ??
    'https://api.anthropic.com/v1';

  const getHeaders = () => ({
    'anthropic-version': '2023-06-01',
    'anthropic-beta': 'computer-use-2024-10-22',
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

  provider.tools = {
    bash_20241022(options: {
      execute?: (
        args: z.infer<typeof Bash20241022Parameters>,
        options: { abortSignal?: AbortSignal },
      ) => Promise<JSONValue>;
    }) {
      return {
        type: 'provider-defined',
        id: 'anthropic.bash_20241022',
        args: {},
        parameters: Bash20241022Parameters,
        execute: options.execute,
      };
    },
  };

  return provider as AnthropicProvider;
}

/**
Default Anthropic provider instance.
 */
export const anthropic = createAnthropic();
