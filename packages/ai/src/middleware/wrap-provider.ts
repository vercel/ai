import type { ProviderV2, ProviderV3, ProviderV4 } from '@ai-sdk/provider';
import type { ImageModelMiddleware } from '../types/image-model-middleware';
import type { LanguageModelMiddleware } from '../types/language-model-middleware';
import { wrapImageModel } from './wrap-image-model';
import { wrapLanguageModel } from './wrap-language-model';
import { asProviderV4 } from '../model/as-provider-v4';

/**
 * Wraps a ProviderV4 instance with middleware functionality.
 * This function allows you to apply middleware to all language models
 * from the provider, enabling you to transform parameters, wrap generate
 * operations, and wrap stream operations for every language model.
 *
 * @param options - Configuration options for wrapping the provider.
 * @param options.provider - The original ProviderV4 instance to be wrapped.
 * @param options.languageModelMiddleware - The middleware to be applied to all language models from the provider. When multiple middlewares are provided, the first middleware will transform the input first, and the last middleware will be wrapped directly around the model.
 * @param options.imageModelMiddleware - Optional middleware to be applied to all image models from the provider. When multiple middlewares are provided, the first middleware will transform the input first, and the last middleware will be wrapped directly around the model.
 * @returns A new ProviderV4 instance with middleware applied to all language models.
 */
export function wrapProvider({
  provider,
  languageModelMiddleware,
  imageModelMiddleware,
}: {
  provider: ProviderV4 | ProviderV3 | ProviderV2;
  languageModelMiddleware: LanguageModelMiddleware | LanguageModelMiddleware[];
  imageModelMiddleware?: ImageModelMiddleware | ImageModelMiddleware[];
}): ProviderV4 {
  const providerV4 = asProviderV4(provider);
  return {
    specificationVersion: 'v4',
    languageModel: (modelId: string) =>
      wrapLanguageModel({
        model: providerV4.languageModel(modelId),
        middleware: languageModelMiddleware,
      }),
    // Call the forwarded factories through the provider rather than copying the
    // method references: a class-based provider keeps its configuration in
    // private fields, and a copied reference runs with the wrapper as `this`.
    embeddingModel: (modelId: string) => providerV4.embeddingModel(modelId),
    imageModel: (modelId: string) => {
      let model = providerV4.imageModel(modelId);

      if (imageModelMiddleware != null) {
        model = wrapImageModel({ model, middleware: imageModelMiddleware });
      }

      return model;
    },
    transcriptionModel: providerV4.transcriptionModel
      ? (modelId: string) => providerV4.transcriptionModel!(modelId)
      : undefined,
    speechModel: providerV4.speechModel
      ? (modelId: string) => providerV4.speechModel!(modelId)
      : undefined,
    rerankingModel: providerV4.rerankingModel
      ? (modelId: string) => providerV4.rerankingModel!(modelId)
      : undefined,
    ...(providerV4.files != null ? { files: providerV4.files } : {}),
    ...(providerV4.skills != null ? { skills: providerV4.skills } : {}),
  };
}
