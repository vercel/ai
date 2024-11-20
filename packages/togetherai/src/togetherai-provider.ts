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
    // TODO(shaper): Perhaps the object generation mode will vary by model.
    const defaultSettings: Partial<TogetherAIChatSettings> = {
      defaultObjectGenerationMode: 'tool',
    };
    const mergedSettings = { ...defaultSettings, ...settings };
    return openAICompatibleProvider.chatModel(modelId, mergedSettings);
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
