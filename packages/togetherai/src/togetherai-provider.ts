import {
  OpenAICompatibleProvider,
  createOpenAICompatible,
  OpenAICompatibleChatSettings,
  OpenAICompatibleProviderSettings,
} from '@ai-sdk/openai-compatible';
import { LanguageModelV1, EmbeddingModelV1 } from '@ai-sdk/provider';
import { TogetherAIChatModelId } from './togetherai-chat-settings';
import {
  TogetherAIEmbeddingModelId,
  TogetherAIEmbeddingSettings,
} from './togetherai-embedding-settings';
import {
  TogetherAICompletionModelId,
  TogetherAICompletionSettings,
} from './togetherai-completion-settings';

export interface TogetherAIProviderSettings
  extends OpenAICompatibleProviderSettings {}

export interface TogetherAIProvider
  extends OpenAICompatibleProvider<
    TogetherAIChatModelId,
    TogetherAICompletionModelId,
    TogetherAIEmbeddingModelId
  > {
  chatModel(
    modelId: TogetherAIChatModelId,
    settings?: OpenAICompatibleChatSettings,
  ): LanguageModelV1;

  completionModel(
    modelId: TogetherAICompletionModelId,
    settings?: OpenAICompatibleChatSettings,
  ): LanguageModelV1;

  textEmbeddingModel(
    modelId: TogetherAIEmbeddingModelId,
    settings?: TogetherAIEmbeddingSettings,
  ): EmbeddingModelV1<string>;
}

export function createTogetherAI(
  options: TogetherAIProviderSettings = {},
): TogetherAIProvider {
  const providerOptions: OpenAICompatibleProviderSettings = {
    baseURL: 'https://api.together.xyz/v1/',
    name: 'togetherai',
    apiKeyEnvVarName: 'TOGETHER_AI_API_KEY',
    apiKeyEnvVarDescription: "TogetherAI's API key",
    ...options,
  };
  const openAICompatibleProvider = createOpenAICompatible<
    TogetherAIChatModelId,
    TogetherAICompletionModelId,
    TogetherAIEmbeddingModelId
  >(providerOptions);

  const togetheraiProvider: TogetherAIProvider = Object.assign(
    (
      modelId: TogetherAIChatModelId,
      settings?: OpenAICompatibleChatSettings,
    ): LanguageModelV1 => {
      return openAICompatibleProvider(modelId, settings);
    },
    {
      chatModel: (
        modelId: TogetherAIChatModelId,
        settings?: OpenAICompatibleChatSettings,
      ) => {
        return openAICompatibleProvider.chatModel(modelId, settings);
      },

      completionModel: (
        modelId: TogetherAICompletionModelId,
        settings?: TogetherAICompletionSettings,
      ) => {
        return openAICompatibleProvider.languageModel(modelId, settings);
      },

      textEmbeddingModel: (
        modelId: TogetherAIEmbeddingModelId,
        settings?: TogetherAIEmbeddingSettings,
      ) => {
        return openAICompatibleProvider.textEmbeddingModel(modelId, settings);
      },
    },
  ) as TogetherAIProvider;

  return togetheraiProvider;
}

export const togetherai = createTogetherAI();
