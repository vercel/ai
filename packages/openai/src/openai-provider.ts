import { loadApiKey, withoutTrailingSlash } from '@ai-sdk/provider-utils';
import { OpenAIChatLanguageModel } from './openai-chat-language-model';
import { OpenAIChatModelId, OpenAIChatSettings } from './openai-chat-settings';
import { OpenAICompletionLanguageModel } from './openai-completion-language-model';
import {
  OpenAICompletionModelId,
  OpenAICompletionSettings,
} from './openai-completion-settings';
import { OpenAIEmbeddingModel } from './openai-embedding-model';
import {
  OpenAIEmbeddingModelId,
  OpenAIEmbeddingSettings,
} from './openai-embedding-settings';

export interface OpenAIProvider {
  (
    modelId: 'gpt-3.5-turbo-instruct',
    settings?: OpenAICompletionSettings,
  ): OpenAICompletionLanguageModel;
  (
    modelId: OpenAIChatModelId,
    settings?: OpenAIChatSettings,
  ): OpenAIChatLanguageModel;

  /**
Creates an OpenAI chat model for text generation.
   */
  chat(
    modelId: OpenAIChatModelId,
    settings?: OpenAIChatSettings,
  ): OpenAIChatLanguageModel;

  /**
Creates an OpenAI completion model for text generation.
   */
  completion(
    modelId: OpenAICompletionModelId,
    settings?: OpenAICompletionSettings,
  ): OpenAICompletionLanguageModel;

  /**
Creates a model for text embeddings.
   */
  embedding(
    modelId: OpenAIEmbeddingModelId,
    settings?: OpenAIEmbeddingSettings,
  ): OpenAIEmbeddingModel;
}

export interface OpenAIProviderSettings {
  /**
Base URL for the OpenAI API calls.
     */
  baseURL?: string;

  /**
@deprecated Use `baseURL` instead.
     */
  baseUrl?: string;

  /**
API key for authenticating requests.
     */
  apiKey?: string;

  /**
OpenAI Organization.
     */
  organization?: string;

  /**
OpenAI project.
     */
  project?: string;

  /**
Custom headers to include in the requests.
     */
  headers?: Record<string, string>;

  /**
OpenAI compatibility mode. Should be set to `strict` when using the OpenAI API,
and `compatible` when using 3rd party providers. In `compatible` mode, newer
information such as streamOptions are not being sent. Defaults to 'compatible'.
   */
  compatibility?: 'strict' | 'compatible';

  /**
Custom fetch implementation. You can use it as a middleware to intercept requests,
or to provide a custom fetch implementation for e.g. testing.
    */
  fetch?: typeof fetch;
}

/**
Create an OpenAI provider instance.
 */
export function createOpenAI(
  options: OpenAIProviderSettings = {},
): OpenAIProvider {
  const baseURL =
    withoutTrailingSlash(options.baseURL ?? options.baseUrl) ??
    'https://api.openai.com/v1';

  // we default to compatible, because strict breaks providers like Groq:
  const compatibility = options.compatibility ?? 'compatible';

  const getHeaders = () => ({
    Authorization: `Bearer ${loadApiKey({
      apiKey: options.apiKey,
      environmentVariableName: 'OPENAI_API_KEY',
      description: 'OpenAI',
    })}`,
    'OpenAI-Organization': options.organization,
    'OpenAI-Project': options.project,
    ...options.headers,
  });

  const createChatModel = (
    modelId: OpenAIChatModelId,
    settings: OpenAIChatSettings = {},
  ) =>
    new OpenAIChatLanguageModel(modelId, settings, {
      provider: 'openai.chat',
      url: ({ path }) => `${baseURL}${path}`,
      headers: getHeaders,
      compatibility,
      fetch: options.fetch,
    });

  const createCompletionModel = (
    modelId: OpenAICompletionModelId,
    settings: OpenAICompletionSettings = {},
  ) =>
    new OpenAICompletionLanguageModel(modelId, settings, {
      provider: 'openai.completion',
      baseURL,
      headers: getHeaders,
      compatibility,
      fetch: options.fetch,
    });

  const createEmbeddingModel = (
    modelId: OpenAIEmbeddingModelId,
    settings: OpenAIEmbeddingSettings = {},
  ) =>
    new OpenAIEmbeddingModel(modelId, settings, {
      provider: 'openai.embedding',
      baseURL,
      headers: getHeaders,
      fetch: options.fetch,
    });

  const provider = function (
    modelId: OpenAIChatModelId | OpenAICompletionModelId,
    settings?: OpenAIChatSettings | OpenAICompletionSettings,
  ) {
    if (new.target) {
      throw new Error(
        'The OpenAI model function cannot be called with the new keyword.',
      );
    }

    if (modelId === 'gpt-3.5-turbo-instruct') {
      return createCompletionModel(
        modelId,
        settings as OpenAICompletionSettings,
      );
    }

    return createChatModel(modelId, settings as OpenAIChatSettings);
  };

  provider.chat = createChatModel;
  provider.completion = createCompletionModel;
  provider.embedding = createEmbeddingModel;

  return provider as OpenAIProvider;
}

/**
Default OpenAI provider instance. It uses 'strict' compatibility mode.
 */
export const openai = createOpenAI({
  compatibility: 'strict', // strict for OpenAI API
});
