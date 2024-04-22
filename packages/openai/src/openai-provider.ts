import { OpenAIChatLanguageModel } from './openai-chat-language-model';
import { OpenAIChatModelId, OpenAIChatSettings } from './openai-chat-settings';
import { OpenAICompletionLanguageModel } from './openai-completion-language-model';
import {
  OpenAICompletionModelId,
  OpenAICompletionSettings,
} from './openai-completion-settings';
import { OpenAI } from './openai-facade';

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

/**
 * Create an OpenAI provider.
 */
export function createOpenAI(
  options: {
    /**
     * Base URL for the OpenAI API calls.
     */
    baseURL?: string;

    /**
     * @deprecated Use `baseURL` instead.
     */
    baseUrl?: string;

    /**
     * API key for authenticating requests.
     */
    apiKey?: string;

    /**
     * Organization ID.
     */
    organization?: string;
  } = {},
): OpenAIProvider {
  const openai = new OpenAI(options);

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
      return openai.completion(modelId, settings as OpenAICompletionSettings);
    } else {
      return openai.chat(modelId, settings as OpenAIChatSettings);
    }
  };

  provider.chat = openai.chat.bind(openai);
  provider.completion = openai.completion.bind(openai);

  return provider as OpenAIProvider;
}

/**
 * Default OpenAI provider instance.
 */
export const openai = createOpenAI();
