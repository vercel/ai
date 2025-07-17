import type { LanguageModelV2Middleware, ProviderV2 } from '@ai-sdk/provider';
import { wrapLanguageModel } from './wrap-language-model';

/**
 * Wraps a ProviderV2 instance with middleware functionality.
 * This function allows you to apply middleware to all language models
 * from the provider, enabling you to transform parameters, wrap generate
 * operations, and wrap stream operations for every language model.
 *
 * @param options - Configuration options for wrapping the provider.
 * @param options.provider - The original ProviderV2 instance to be wrapped.
 * @param options.languageModelMiddleware - The middleware to be applied to all language models from the provider. When multiple middlewares are provided, the first middleware will transform the input first, and the last middleware will be wrapped directly around the model.
 * @param options.languageModelIdOverride - Optional custom model ID to override the original model's ID for all language models from the provider.
 * @param options.languageModelProviderIdOverride - Optional custom provider ID to override the original model's provider ID for all language models from the provider.
 * @returns A new ProviderV2 instance with middleware applied to all language models.
 */
export function wrapProvider({
  provider,
  languageModelMiddleware,
  languageModelIdOverride,
  languageModelProviderIdOverride,
}: {
  provider: ProviderV2;
  languageModelMiddleware:
    | LanguageModelV2Middleware
    | LanguageModelV2Middleware[];
  languageModelIdOverride?: string;
  languageModelProviderIdOverride?: string;
}): ProviderV2 {
  const wrappedProvider = {
    languageModel(modelId: string) {
      const originalModel = provider.languageModel(modelId);
      const wrappedModel = wrapLanguageModel({
        model: originalModel,
        middleware: languageModelMiddleware,
        modelId: languageModelIdOverride,
        providerId: languageModelProviderIdOverride,
      });
      return wrappedModel;
    },
    textEmbeddingModel: provider.textEmbeddingModel,
    imageModel: provider.imageModel,
    transcriptionModel: provider.transcriptionModel,
    speechModel: provider.speechModel,
  };

  return wrappedProvider;
}
