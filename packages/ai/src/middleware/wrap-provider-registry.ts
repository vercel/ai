import type {
  EmbeddingModelV2,
  ImageModelV2,
  LanguageModelV2,
  LanguageModelV2Middleware,
  ProviderV2,
  SpeechModelV2,
  TranscriptionModelV2,
} from '@ai-sdk/provider';
import type {
  ExtractLiteralUnion,
  ProviderRegistryProvider,
} from '../registry/provider-registry';
import { wrapLanguageModel } from './wrap-language-model';

class WrappedProviderRegistry<
  PROVIDERS extends Record<string, ProviderV2>,
  SEPARATOR extends string,
> implements ProviderRegistryProvider<PROVIDERS, SEPARATOR>
{
  private registry: ProviderRegistryProvider<PROVIDERS, SEPARATOR>;
  private middleware: LanguageModelV2Middleware | LanguageModelV2Middleware[];
  private modelId?: string;
  private providerId?: string;

  constructor({
    registry,
    middleware,
    modelId,
    providerId,
  }: {
    registry: ProviderRegistryProvider<PROVIDERS, SEPARATOR>;
    middleware: LanguageModelV2Middleware | LanguageModelV2Middleware[];
    modelId?: string;
    providerId?: string;
  }) {
    this.registry = registry;
    this.middleware = middleware;
    this.modelId = modelId;
    this.providerId = providerId;
  }

  languageModel<KEY extends keyof PROVIDERS>(
    id: KEY extends string
      ? `${KEY & string}${SEPARATOR}${ExtractLiteralUnion<Parameters<NonNullable<PROVIDERS[KEY]['languageModel']>>[0]>}`
      : never,
  ): LanguageModelV2;
  languageModel<KEY extends keyof PROVIDERS>(
    id: KEY extends string ? `${KEY & string}${SEPARATOR}${string}` : never,
  ): LanguageModelV2 {
    const originalModel = this.registry.languageModel(id);
    return wrapLanguageModel({
      model: originalModel,
      middleware: this.middleware,
      modelId: this.modelId,
      providerId: this.providerId,
    });
  }

  textEmbeddingModel<KEY extends keyof PROVIDERS>(
    id: KEY extends string
      ? `${KEY & string}${SEPARATOR}${ExtractLiteralUnion<Parameters<NonNullable<PROVIDERS[KEY]['textEmbeddingModel']>>[0]>}`
      : never,
  ): EmbeddingModelV2<string>;
  textEmbeddingModel<KEY extends keyof PROVIDERS>(
    id: KEY extends string ? `${KEY & string}${SEPARATOR}${string}` : never,
  ): EmbeddingModelV2<string> {
    return this.registry.textEmbeddingModel(id);
  }

  imageModel<KEY extends keyof PROVIDERS>(
    id: KEY extends string
      ? `${KEY & string}${SEPARATOR}${ExtractLiteralUnion<Parameters<NonNullable<PROVIDERS[KEY]['imageModel']>>[0]>}`
      : never,
  ): ImageModelV2;
  imageModel<KEY extends keyof PROVIDERS>(
    id: KEY extends string ? `${KEY & string}${SEPARATOR}${string}` : never,
  ): ImageModelV2 {
    return this.registry.imageModel(id);
  }

  transcriptionModel<KEY extends keyof PROVIDERS>(
    id: KEY extends string
      ? `${KEY & string}${SEPARATOR}${ExtractLiteralUnion<Parameters<NonNullable<PROVIDERS[KEY]['transcriptionModel']>>[0]>}`
      : never,
  ): TranscriptionModelV2;
  transcriptionModel<KEY extends keyof PROVIDERS>(
    id: KEY extends string ? `${KEY & string}${SEPARATOR}${string}` : never,
  ): TranscriptionModelV2 {
    return this.registry.transcriptionModel(id);
  }

  speechModel<KEY extends keyof PROVIDERS>(
    id: KEY extends string
      ? `${KEY & string}${SEPARATOR}${ExtractLiteralUnion<Parameters<NonNullable<PROVIDERS[KEY]['speechModel']>>[0]>}`
      : never,
  ): SpeechModelV2;
  speechModel<KEY extends keyof PROVIDERS>(
    id: KEY extends string ? `${KEY & string}${SEPARATOR}${string}` : never,
  ): SpeechModelV2 {
    return this.registry.speechModel(id);
  }
}

/**
 * Wraps a ProviderRegistryProvider instance with middleware functionality.
 * This function allows you to apply middleware to all language models
 * from the provider registry, enabling you to transform parameters, wrap generate
 * operations, and wrap stream operations for every language model accessed through the registry.
 *
 * @param options - Configuration options for wrapping the provider registry.
 * @param options.registry - The original ProviderRegistryProvider instance to be wrapped.
 * @param options.middleware - The middleware to be applied to all language models from the registry. When multiple middlewares are provided, the first middleware will transform the input first, and the last middleware will be wrapped directly around the model.
 * @param options.modelId - Optional custom model ID to override the original model's ID for all language models from the registry.
 * @param options.providerId - Optional custom provider ID to override the original model's provider for all language models from the registry.
 * @returns A new ProviderRegistryProvider instance with middleware applied to all language models.
 */
export function wrapProviderRegistry<
  PROVIDERS extends Record<string, ProviderV2>,
  SEPARATOR extends string,
>({
  registry,
  middleware,
  modelId,
  providerId,
}: {
  registry: ProviderRegistryProvider<PROVIDERS, SEPARATOR>;
  middleware: LanguageModelV2Middleware | LanguageModelV2Middleware[];
  modelId?: string;
  providerId?: string;
}): ProviderRegistryProvider<PROVIDERS, SEPARATOR> {
  const wrappedRegistry = new WrappedProviderRegistry({
    registry,
    middleware,
    modelId,
    providerId,
  });

  return wrappedRegistry;
}
