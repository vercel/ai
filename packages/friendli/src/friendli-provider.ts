import { LanguageModelV1, NoSuchModelError } from '@ai-sdk/provider';
import {
  FetchFunction,
  loadApiKey,
  withoutTrailingSlash,
} from '@ai-sdk/provider-utils';
import { OpenAICompatibleCompletionLanguageModel } from '@ai-sdk/openai-compatible';

import {
  FriendliAILanguageModelId,
  FriendliAIBetaChatModelId,
  FriendliAIChatSettings,
  FriendliAICompletionSettings,
} from './friendli-settings';
import { FriendliAIChatLanguageModel } from './friendli-chat-language-model';
import { friendliaiErrorStructure } from './friendli-error';

export interface FriendliAIProviderSettings {
  /**
   * FriendliAI API key. (FRIENDLI__TOKEN)
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
   * FriendliAI Team ID.
   */
  teamId?: string;
  /**
   * Custom fetch implementation. You can use it as a middleware to intercept requests,
   * or to provide a custom fetch implementation for e.g. testing.
   */
  fetch?: FetchFunction;
}

export interface FriendliAIProvider {
  /**
   * Creates a model for text generation.
   */
  (
    modelId: FriendliAILanguageModelId,
    settings?: FriendliAIChatSettings,
  ): LanguageModelV1;

  /**
   * A model that has not yet been officially released
   */
  beta(
    modelId: FriendliAIBetaChatModelId,
    settings?: FriendliAIChatSettings,
  ): LanguageModelV1;

  /**
   * Creates a chat model for text generation.
   */
  chat(
    modelId: FriendliAILanguageModelId,
    settings?: FriendliAIChatSettings,
  ): LanguageModelV1;
  chatModel(
    modelId: FriendliAILanguageModelId,
    settings?: FriendliAIChatSettings,
  ): LanguageModelV1;

  /**
   * Creates a completion model for text generation.
   */
  completion(
    modelId: string & {},
    settings?: FriendliAIChatSettings,
  ): LanguageModelV1;
  completionModel(
    modelId: string & {},
    settings?: FriendliAIChatSettings,
  ): LanguageModelV1;

  /**
   * Creates a text embedding model for text generation.
   */
  embedding(
    modelId: string & {},
    settings?: FriendliAIChatSettings,
  ): LanguageModelV1;
  textEmbeddingModel(
    modelId: string & {},
    settings?: FriendliAIChatSettings,
  ): LanguageModelV1;
}

/**
Create an FriendliAI provider instance.
 */
export function createFriendli(
  options: FriendliAIProviderSettings = {},
): FriendliAIProvider {
  const baseURL =
    withoutTrailingSlash(options.baseURL) ??
    'https://api.friendli.ai/serverless/v1';
  const baseURLBeta = 'https://api.friendli.ai/serverless/beta';
  const baseURLTools = 'https://api.friendli.ai/serverless/tools/v1';
  const baseURLDedicated = 'https://api.friendli.ai/dedicated/v1';

  const getHeaders = () => ({
    Authorization: `Bearer ${loadApiKey({
      apiKey: options.apiKey,
      environmentVariableName: 'FRIENDLI_TOKEN',
      description: 'FRIENDLI_TOKEN',
    })}`,
    'X-Friendli-Team': options.teamId,
    ...options.headers,
  });

  const createChatModel = (
    modelId: FriendliAILanguageModelId,
    settings: FriendliAIChatSettings = {},
  ) =>
    new FriendliAIChatLanguageModel(modelId, settings, {
      provider: `friendliai.${
        settings.dedicated
          ? 'dedicated'
          : settings.tools?.length
          ? 'tools'
          : 'serverless'
      }.chat`,
      url: ({ path }) =>
        `${
          settings.dedicated
            ? baseURLDedicated
            : settings.tools?.length
            ? baseURLTools
            : baseURL
        }${path}`,
      headers: getHeaders,
      fetch: options.fetch,
      defaultObjectGenerationMode: 'json',
    });

  const createBetaModel = (
    modelId: FriendliAIBetaChatModelId,
    settings: FriendliAIChatSettings = {},
  ) =>
    new FriendliAIChatLanguageModel(modelId, settings, {
      provider: 'friendliai.beta',
      url: ({ path }) => `${baseURLBeta}${path}`,
      headers: getHeaders,
      fetch: options.fetch,
    });

  const createCompletionModel = (
    modelId: FriendliAILanguageModelId,
    settings: FriendliAICompletionSettings = {},
  ) =>
    new OpenAICompatibleCompletionLanguageModel(modelId, settings, {
      provider: `friendliai.${
        settings.dedicated ? 'dedicated' : 'serverless'
      }.completion`,
      url: ({ path }) =>
        `${settings.dedicated ? baseURLDedicated : baseURL}${path}`,
      headers: getHeaders,
      fetch: options.fetch,
      errorStructure: friendliaiErrorStructure,
    });

  const createTextEmbeddingModel = (modelId: string) => {
    throw new NoSuchModelError({ modelId, modelType: 'textEmbeddingModel' });
  };

  const provider = function (
    modelId: FriendliAILanguageModelId,
    settings?: FriendliAIChatSettings,
  ) {
    return createChatModel(modelId, settings);
  };

  provider.beta = createBetaModel;

  provider.chat = createChatModel;
  provider.chatModel = createChatModel;

  provider.completion = createCompletionModel;
  provider.completionModel = createCompletionModel;

  provider.embedding = createTextEmbeddingModel;
  provider.textEmbeddingModel = createTextEmbeddingModel;

  return provider as FriendliAIProvider;
}

export const friendli = createFriendli({});
