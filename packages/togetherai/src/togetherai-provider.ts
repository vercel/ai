import {
  OpenAICompatProvider,
  createOpenAICompat,
  OpenAICompatChatSettings,
  OpenAICompatProviderSettings,
} from '@ai-sdk/openai-compat';
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
  extends OpenAICompatProviderSettings {}

export interface TogetherAIProvider
  extends OpenAICompatProvider<
    | TogetherAIChatModelId
    | TogetherAICompletionModelId
    | TogetherAIEmbeddingModelId
  > {
  chatModel(
    modelId: TogetherAIChatModelId,
    settings?: OpenAICompatChatSettings,
  ): LanguageModelV1;

  completionModel(
    modelId: TogetherAICompletionModelId,
    settings?: OpenAICompatChatSettings,
  ): LanguageModelV1;

  textEmbeddingModel(
    modelId: TogetherAIEmbeddingModelId,
    settings?: TogetherAIEmbeddingSettings,
  ): EmbeddingModelV1<string>;
}

export function createTogetherAI(
  options: TogetherAIProviderSettings = {},
): TogetherAIProvider {
  const providerOptions: OpenAICompatProviderSettings = {
    baseURL: 'https://api.together.xyz/v1/',
    apiKeyEnvVarName: 'TOGETHER_AI_API_KEY',
    apiKeyEnvVarDescription: "TogetherAI's API key",
    ...options,
  };
  // TODO(shaper): Consider separating generics in the ctor.
  const openAICompatProvider = createOpenAICompat<
    | TogetherAIChatModelId
    | TogetherAICompletionModelId
    | TogetherAIEmbeddingModelId
  >(providerOptions);

  const togetheraiProvider: TogetherAIProvider = Object.assign(
    (
      modelId: TogetherAIChatModelId,
      settings?: OpenAICompatChatSettings,
    ): LanguageModelV1 => {
      return openAICompatProvider(modelId, settings);
    },
    {
      chatModel: (
        modelId: TogetherAIChatModelId,
        settings?: OpenAICompatChatSettings,
      ) => {
        return openAICompatProvider.chatModel(modelId, settings);
      },

      completionModel: (
        modelId: TogetherAICompletionModelId,
        settings?: TogetherAICompletionSettings,
      ) => {
        return openAICompatProvider.languageModel(modelId, settings);
      },

      textEmbeddingModel: (
        modelId: TogetherAIEmbeddingModelId,
        settings?: TogetherAIEmbeddingSettings,
      ) => {
        return openAICompatProvider.textEmbeddingModel(modelId, settings);
      },
    },
  ) as TogetherAIProvider;

  return togetheraiProvider;
}

export const togetherai = createTogetherAI();
