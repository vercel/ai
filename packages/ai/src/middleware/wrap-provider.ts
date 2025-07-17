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
 * @returns A new ProviderV2 instance with middleware applied to all language models.
 */
export function wrapProvider({
  provider,
  languageModelMiddleware,
}: {
  provider: ProviderV2;
  languageModelMiddleware:
    | LanguageModelV2Middleware
    | LanguageModelV2Middleware[];
}): ProviderV2 {
  const wrappedProvider = {
    languageModel(modelId: string) {
      let model = provider.languageModel(modelId);
      model = wrapLanguageModel({
        model,
        middleware: languageModelMiddleware,
      });
      return model;
    },
    textEmbeddingModel: provider.textEmbeddingModel,
    imageModel: provider.imageModel,
    transcriptionModel: provider.transcriptionModel,
    speechModel: provider.speechModel,
  };

  return wrappedProvider;
}
