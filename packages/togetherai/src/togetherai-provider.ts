import {
  OpenAICompatibleProvider,
  createOpenAICompatible,
  OpenAICompatibleProviderSettings,
} from '@ai-sdk/openai-compatible';
import { LanguageModelV1, EmbeddingModelV1 } from '@ai-sdk/provider';
import {
  TogetherAIChatModelId,
  TogetherAIChatSettings,
} from './togetherai-chat-settings';
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
    settings?: TogetherAIChatSettings,
    options?: { defaultObjectGenerationMode: 'json' | 'tool' | undefined },
  ): LanguageModelV1;

  completionModel(
    modelId: TogetherAICompletionModelId,
    settings?: TogetherAICompletionSettings,
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

  const createChatModel = (
    modelId: TogetherAIChatModelId,
    settings?: TogetherAIChatSettings,
  ) => {
    // TODO(shaper): Likely need a registry of model to object generation mode.
    return openAICompatibleProvider.chatModel(modelId, settings, {
      defaultObjectGenerationMode: 'json',
    });
  };

  const createCompletionModel = (
    modelId: TogetherAICompletionModelId,
    settings?: TogetherAICompletionSettings,
  ) => openAICompatibleProvider.languageModel(modelId, settings);

  const createTextEmbeddingModel = (
    modelId: TogetherAIEmbeddingModelId,
    settings?: TogetherAIEmbeddingSettings,
  ) => openAICompatibleProvider.textEmbeddingModel(modelId, settings);

  const provider = function (
    modelId: TogetherAIChatModelId,
    settings?: TogetherAIChatSettings,
  ) {
    return createCompletionModel(modelId, settings);
  };

  provider.completionModel = createCompletionModel;
  provider.chatModel = createChatModel;
  provider.textEmbeddingModel = createTextEmbeddingModel;

  return provider as TogetherAIProvider;
}

export const togetherai = createTogetherAI();
