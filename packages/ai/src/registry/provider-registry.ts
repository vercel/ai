import {
  EmbeddingModelV2,
  ImageModelV2,
  LanguageModelV2,
  LanguageModelV2Middleware,
  NoSuchModelError,
  ProviderV2,
  SpeechModelV2,
  TranscriptionModelV2,
} from '@ai-sdk/provider';
import { NoSuchProviderError } from './no-such-provider-error';
import { wrapLanguageModel } from '../middleware/wrap-language-model';

type ExtractLiteralUnion<T> = T extends string
  ? string extends T
    ? never
    : T
  : never;

export interface ProviderRegistryProvider<
  PROVIDERS extends Record<string, ProviderV2> = Record<string, ProviderV2>,
  SEPARATOR extends string = ':',
> {
  languageModel<KEY extends keyof PROVIDERS>(
    id: KEY extends string
      ? `${KEY & string}${SEPARATOR}${ExtractLiteralUnion<Parameters<NonNullable<PROVIDERS[KEY]['languageModel']>>[0]>}`
      : never,
  ): LanguageModelV2;
  languageModel<KEY extends keyof PROVIDERS>(
    id: KEY extends string ? `${KEY & string}${SEPARATOR}${string}` : never,
  ): LanguageModelV2;

  textEmbeddingModel<KEY extends keyof PROVIDERS>(
    id: KEY extends string
      ? `${KEY & string}${SEPARATOR}${ExtractLiteralUnion<Parameters<NonNullable<PROVIDERS[KEY]['textEmbeddingModel']>>[0]>}`
      : never,
  ): EmbeddingModelV2<string>;
  textEmbeddingModel<KEY extends keyof PROVIDERS>(
    id: KEY extends string ? `${KEY & string}${SEPARATOR}${string}` : never,
  ): EmbeddingModelV2<string>;

  imageModel<KEY extends keyof PROVIDERS>(
    id: KEY extends string
      ? `${KEY & string}${SEPARATOR}${ExtractLiteralUnion<Parameters<NonNullable<PROVIDERS[KEY]['imageModel']>>[0]>}`
      : never,
  ): ImageModelV2;
  imageModel<KEY extends keyof PROVIDERS>(
    id: KEY extends string ? `${KEY & string}${SEPARATOR}${string}` : never,
  ): ImageModelV2;

  transcriptionModel<KEY extends keyof PROVIDERS>(
    id: KEY extends string
      ? `${KEY & string}${SEPARATOR}${ExtractLiteralUnion<Parameters<NonNullable<PROVIDERS[KEY]['transcriptionModel']>>[0]>}`
      : never,
  ): TranscriptionModelV2;
  transcriptionModel<KEY extends keyof PROVIDERS>(
    id: KEY extends string ? `${KEY & string}${SEPARATOR}${string}` : never,
  ): TranscriptionModelV2;

  speechModel<KEY extends keyof PROVIDERS>(
    id: KEY extends string
      ? `${KEY & string}${SEPARATOR}${ExtractLiteralUnion<Parameters<NonNullable<PROVIDERS[KEY]['speechModel']>>[0]>}`
      : never,
  ): SpeechModelV2;
  speechModel<KEY extends keyof PROVIDERS>(
    id: KEY extends string ? `${KEY & string}${SEPARATOR}${string}` : never,
  ): SpeechModelV2;
}

/**
 * Creates a registry for the given providers with optional middleware functionality.
 * This function allows you to register multiple providers and optionally apply middleware
 * to all language models from the registry, enabling you to transform parameters, wrap generate
 * operations, and wrap stream operations for every language model accessed through the registry.
 *
 * @param providers - A record of provider instances to be registered in the registry.
 * @param options - Configuration options for the provider registry.
 * @param options.separator - The separator used between provider ID and model ID in the combined identifier. Defaults to ':'.
 * @param options.languageModelMiddleware - Optional middleware to be applied to all language models from the registry. When multiple middlewares are provided, the first middleware will transform the input first, and the last middleware will be wrapped directly around the model.
 * @returns A new ProviderRegistryProvider instance that provides access to all registered providers with optional middleware applied to language models.
 */
export function createProviderRegistry<
  PROVIDERS extends Record<string, ProviderV2>,
  SEPARATOR extends string = ':',
>(
  providers: PROVIDERS,
  {
    separator = ':' as SEPARATOR,
    languageModelMiddleware,
  }: {
    separator?: SEPARATOR;
    languageModelMiddleware?:
      | LanguageModelV2Middleware
      | LanguageModelV2Middleware[];
  } = {},
): ProviderRegistryProvider<PROVIDERS, SEPARATOR> {
  const registry = new DefaultProviderRegistry<PROVIDERS, SEPARATOR>({
    separator,
    languageModelMiddleware,
  });

  for (const [id, provider] of Object.entries(providers)) {
    registry.registerProvider({ id, provider } as {
      id: keyof PROVIDERS;
      provider: PROVIDERS[keyof PROVIDERS];
    });
  }

  return registry;
}

/**
 * @deprecated Use `createProviderRegistry` instead.
 */
export const experimental_createProviderRegistry = createProviderRegistry;

class DefaultProviderRegistry<
  PROVIDERS extends Record<string, ProviderV2>,
  SEPARATOR extends string,
> implements ProviderRegistryProvider<PROVIDERS, SEPARATOR>
{
  private providers: PROVIDERS = {} as PROVIDERS;
  private separator: SEPARATOR;
  private languageModelMiddleware?:
    | LanguageModelV2Middleware
    | LanguageModelV2Middleware[];

  constructor({
    separator,
    languageModelMiddleware,
  }: {
    separator: SEPARATOR;
    languageModelMiddleware?:
      | LanguageModelV2Middleware
      | LanguageModelV2Middleware[];
  }) {
    this.separator = separator;
    this.languageModelMiddleware = languageModelMiddleware;
  }

  registerProvider<K extends keyof PROVIDERS>({
    id,
    provider,
  }: {
    id: K;
    provider: PROVIDERS[K];
  }): void {
    this.providers[id] = provider;
  }

  private getProvider(
    id: string,
    modelType:
      | 'languageModel'
      | 'textEmbeddingModel'
      | 'imageModel'
      | 'transcriptionModel'
      | 'speechModel',
  ): ProviderV2 {
    const provider = this.providers[id as keyof PROVIDERS];

    if (provider == null) {
      throw new NoSuchProviderError({
        modelId: id,
        modelType,
        providerId: id,
        availableProviders: Object.keys(this.providers),
      });
    }

    return provider;
  }

  private splitId(
    id: string,
    modelType:
      | 'languageModel'
      | 'textEmbeddingModel'
      | 'imageModel'
      | 'transcriptionModel'
      | 'speechModel',
  ): [string, string] {
    const index = id.indexOf(this.separator);

    if (index === -1) {
      throw new NoSuchModelError({
        modelId: id,
        modelType,
        message:
          `Invalid ${modelType} id for registry: ${id} ` +
          `(must be in the format "providerId${this.separator}modelId")`,
      });
    }

    return [id.slice(0, index), id.slice(index + this.separator.length)];
  }

  languageModel<KEY extends keyof PROVIDERS>(
    id: `${KEY & string}${SEPARATOR}${string}`,
  ): LanguageModelV2 {
    const [providerId, modelId] = this.splitId(id, 'languageModel');
    let model = this.getProvider(providerId, 'languageModel').languageModel?.(
      modelId,
    );

    if (model == null) {
      throw new NoSuchModelError({ modelId: id, modelType: 'languageModel' });
    }

    if (this.languageModelMiddleware != null) {
      model = wrapLanguageModel({
        model,
        middleware: this.languageModelMiddleware,
      });
    }

    return model;
  }

  textEmbeddingModel<KEY extends keyof PROVIDERS>(
    id: `${KEY & string}${SEPARATOR}${string}`,
  ): EmbeddingModelV2<string> {
    const [providerId, modelId] = this.splitId(id, 'textEmbeddingModel');
    const provider = this.getProvider(providerId, 'textEmbeddingModel');

    const model = provider.textEmbeddingModel?.(modelId);

    if (model == null) {
      throw new NoSuchModelError({
        modelId: id,
        modelType: 'textEmbeddingModel',
      });
    }

    return model;
  }

  imageModel<KEY extends keyof PROVIDERS>(
    id: `${KEY & string}${SEPARATOR}${string}`,
  ): ImageModelV2 {
    const [providerId, modelId] = this.splitId(id, 'imageModel');
    const provider = this.getProvider(providerId, 'imageModel');

    const model = provider.imageModel?.(modelId);

    if (model == null) {
      throw new NoSuchModelError({ modelId: id, modelType: 'imageModel' });
    }

    return model;
  }

  transcriptionModel<KEY extends keyof PROVIDERS>(
    id: `${KEY & string}${SEPARATOR}${string}`,
  ): TranscriptionModelV2 {
    const [providerId, modelId] = this.splitId(id, 'transcriptionModel');
    const provider = this.getProvider(providerId, 'transcriptionModel');

    const model = provider.transcriptionModel?.(modelId);

    if (model == null) {
      throw new NoSuchModelError({
        modelId: id,
        modelType: 'transcriptionModel',
      });
    }

    return model;
  }

  speechModel<KEY extends keyof PROVIDERS>(
    id: `${KEY & string}${SEPARATOR}${string}`,
  ): SpeechModelV2 {
    const [providerId, modelId] = this.splitId(id, 'speechModel');
    const provider = this.getProvider(providerId, 'speechModel');

    const model = provider.speechModel?.(modelId);

    if (model == null) {
      throw new NoSuchModelError({ modelId: id, modelType: 'speechModel' });
    }

    return model;
  }
}
