import {
  OpenAICompatProvider,
  createOpenAICompat,
  OpenAICompatChatSettings,
  OpenAICompatProviderSettings,
} from '@ai-sdk/openai-compat';
import { LanguageModelV1 } from '@ai-sdk/provider';

// https://api.together.ai/models
// https://docs.together.ai/docs/serverless-models
// https://docs.together.ai/docs/dedicated-models
export type TogetherAIChatModelId =
  | 'google/gemma-2-9b-it'
  | 'meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo';

// TODO(shaper): Add Language and Embedding model ids.

export interface TogetherAIProviderSettings
  extends OpenAICompatProviderSettings {
  /**
   * Additional Together-specific settings can be added here.
   */
  togetherOption?: string;
}

export interface TogetherAIProvider
  extends OpenAICompatProvider<TogetherAIChatModelId> {
  /**
   * Example of a Together-specific method.
   */
  togetherSpecificMethod(): void;
}

export function createTogetherAI(
  options: TogetherAIProviderSettings = {},
): TogetherAIProvider {
  // Create an instance of OpenAICompatProvider with the provided options
  const openAICompatProvider =
    createOpenAICompat<TogetherAIChatModelId>(options);

  /**
   * Implement Together-specific methods here.
   * For example, a method that performs additional logging.
   */
  const togetherSpecificMethod = () => {
    console.log('Together-specific method invoked.');
    // Add any Together-specific logic here
  };

  /**
   * Combine OpenAICompatProvider with Together-specific methods.
   * Object.assign is used to merge the functions and methods.
   */
  const togetheraiProvider: TogetherAIProvider = Object.assign(
    // The provider function
    (
      modelId: TogetherAIChatModelId,
      settings?: OpenAICompatChatSettings,
    ): LanguageModelV1 => {
      return openAICompatProvider(modelId, settings);
    },
    {
      // Delegate the languageModel method to OpenAICompatProvider
      languageModel: openAICompatProvider.languageModel,

      // Delegate the chat method to OpenAICompatProvider
      // chat: openAICompatProvider.chat,

      // // Delegate the textEmbeddingModel method to OpenAICompatProvider
      // textEmbeddingModel: openAICompatProvider.textEmbeddingModel,

      // // Add Together-specific methods
      // togetherSpecificMethod,

      // You can add more Together-specific methods or override existing ones if needed
    },
  ) as TogetherAIProvider;

  return togetheraiProvider;
}

export const togetherai = createTogetherAI();
