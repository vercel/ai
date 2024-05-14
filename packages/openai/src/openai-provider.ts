import { loadApiKey, withoutTrailingSlash } from '@ai-sdk/provider-utils';
import { OpenAIChatLanguageModel } from './openai-chat-language-model';
import { OpenAIChatModelId, OpenAIChatSettings } from './openai-chat-settings';
import { OpenAICompletionLanguageModel } from './openai-completion-language-model';
import {
  OpenAICompletionModelId,
  OpenAICompletionSettings,
} from './openai-completion-settings';

export interface OpenAIProvider {
  (
    modelId: 'gpt-3.5-turbo-instruct',
    settings?: OpenAICompletionSettings,
  ): OpenAICompletionLanguageModel;
  (
    modelId: OpenAIChatModelId,
    settings?: OpenAIChatSettings,
  ): OpenAIChatLanguageModel;

  chat(
    modelId: OpenAIChatModelId,
    settings?: OpenAIChatSettings,
  ): OpenAIChatLanguageModel;

  completion(
    modelId: OpenAICompletionModelId,
    settings?: OpenAICompletionSettings,
  ): OpenAICompletionLanguageModel;
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
      baseURL,
      headers: getHeaders,
    });

  const createCompletionModel = (
    modelId: OpenAICompletionModelId,
    settings: OpenAICompletionSettings = {},
  ) =>
    new OpenAICompletionLanguageModel(modelId, settings, {
      provider: 'openai.completion',
      baseURL,
      headers: getHeaders,
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

  return provider as OpenAIProvider;
}

/**
Default OpenAI provider instance.
 */
export const openai = createOpenAI();
