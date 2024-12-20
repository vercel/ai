import {
  LanguageModelV1,
  NoSuchModelError,
  ProviderV1,
} from "@ai-sdk/provider";
import {
  FetchFunction,
  loadApiKey,
  withoutTrailingSlash,
} from "@ai-sdk/provider-utils";
import { FriendliAIChatLanguageModel } from "./friendliai-chat-language-model";
import {
  FriendliAIBetaChatModelId,
  FriendliAIChatModelId,
  FriendliAIChatSettings,
} from "./friendliai-chat-settings";

export interface FriendliAIProvider extends ProviderV1 {
  (
    modelId: FriendliAIChatModelId,
    settings?: FriendliAIChatSettings,
  ): LanguageModelV1;

  /**
   * Creates an FriendliAI model for text generation.
   */
  languageModel(
    modelId: FriendliAIChatModelId,
    settings?: FriendliAIChatSettings,
  ): LanguageModelV1;

  chat(
    modelId: FriendliAIChatModelId,
    settings?: FriendliAIChatSettings,
  ): LanguageModelV1;

  serverless(
    modelId: FriendliAIChatModelId,
    settings?: FriendliAIChatSettings,
  ): LanguageModelV1;

  dedicated(
    modelId: FriendliAIChatModelId,
    settings?: FriendliAIChatSettings,
  ): LanguageModelV1;

  /**
   * A model that has not yet been officially released
   */
  beta(
    modelId: FriendliAIBetaChatModelId,
    settings?: FriendliAIChatSettings,
  ): LanguageModelV1;
}

export interface FriendliAIProviderSettings {
  /**
Base URL for the FriendliAI API calls.
     */
  baseURL?: string;

  /**
API key for authenticating requests.
     */
  apiKey?: string;

  /**
   FriendliAI Team ID.
   */
  teamId?: string;

  /**
Custom headers to include in the requests.
     */
  headers?: Record<string, string>;

  /**
Custom fetch implementation. You can use it as a middleware to intercept requests,
or to provide a custom fetch implementation for e.g. testing.
    */
  fetch?: FetchFunction;
}

/**
Create an FriendliAI provider instance.
 */
export function createFriendli(
  options: FriendliAIProviderSettings = {},
): FriendliAIProvider {
  const baseURL =
    withoutTrailingSlash(options.baseURL) ??
    "https://api.friendli.ai/serverless/v1";

  const baseURLBeta = "https://api.friendli.ai/serverless/beta";
  const baseURLTools = "https://api.friendli.ai/serverless/tools/v1";
  const baseURLDedicated = "https://api.friendli.ai/dedicated/v1";

  const getHeaders = () => ({
    Authorization: `Bearer ${loadApiKey({
      apiKey: options.apiKey,
      environmentVariableName: "FRIENDLI_TOKEN",
      description: "FRIENDLI_TOKEN",
    })}`,
    "X-Friendli-Team": options.teamId,
    ...options.headers,
  });

  const provider = function (
    modelId: FriendliAIChatModelId,
    settings?: FriendliAIChatSettings,
  ) {
    return createChatModel(modelId, settings);
  };

  const createBetaModel = (
    modelId: FriendliAIBetaChatModelId,
    settings: FriendliAIChatSettings = {},
  ) =>
    new FriendliAIChatLanguageModel(modelId, settings, {
      provider: "friendliai.chat",
      url: ({ path }) => `${baseURLBeta}${path}`,
      headers: getHeaders,
      fetch: options.fetch,
    });

  const createChatModel = (
    modelId: FriendliAIChatModelId,
    settings: FriendliAIChatSettings = {},
  ) =>
    new FriendliAIChatLanguageModel(modelId, settings, {
      provider: "friendliai.chat",
      url: ({ path }) =>
        `${settings.tools?.length ? baseURLTools : baseURL}${path}`,
      headers: getHeaders,
      fetch: options.fetch,
    });

  const createDedicatedChatModel = (
    modelId: FriendliAIChatModelId,
    settings: FriendliAIChatSettings = {},
  ) =>
    new FriendliAIChatLanguageModel(modelId, settings, {
      provider: "friendliai.chat",
      url: ({ path }) => `${baseURLDedicated}${path}`,
      headers: getHeaders,
      fetch: options.fetch,
    });

  const createEmbeddingModel = (modelId: string) => {
    throw new NoSuchModelError({ modelId, modelType: "textEmbeddingModel" });
  };

  provider.chat = createChatModel;
  provider.serverless = createChatModel;
  provider.beta = createBetaModel;
  provider.dedicated = createDedicatedChatModel;

  provider.languageModel = createChatModel;
  provider.textEmbeddingModel = createEmbeddingModel;

  return provider as FriendliAIProvider;
}

export const friendli = createFriendli({});

/**
 * @deprecated Use `friendli` instead.
 */
export const friendliai = friendli;

/**
 * @deprecated Use `createFriendli` instead.
 */
export const createFriendliAI = createFriendli;
