import {
  EmbeddingModelV4,
  Experimental_VideoModelV4,
  FilesV4,
  ImageModelV4,
  LanguageModelV4,
  NoSuchModelError,
  ProviderV2,
  ProviderV3,
  ProviderV4,
  RerankingModelV4,
  SkillsV4,
  SpeechModelV4,
  TranscriptionModelV4,
} from '@ai-sdk/provider';
import { wrapImageModel } from '../middleware/wrap-image-model';
import { wrapLanguageModel } from '../middleware/wrap-language-model';
import { asProviderV4 } from '../model/as-provider-v4';
import { ImageModelMiddleware, LanguageModelMiddleware } from '../types';
import { NoSuchProviderError } from './no-such-provider-error';

type ExtractLiteralUnion<T> = T extends string
  ? string extends T
    ? never
    : T
  : never;

export interface ProviderRegistryProvider<
  PROVIDERS extends Record<string, ProviderV4> = Record<string, ProviderV4>,
  SEPARATOR extends string = ':',
> {
  languageModel<KEY extends keyof PROVIDERS>(
    id: KEY extends string
      ? `${KEY & string}${SEPARATOR}${ExtractLiteralUnion<Parameters<NonNullable<PROVIDERS[KEY]['languageModel']>>[0]>}`
      : never,
  ): LanguageModelV4;
  languageModel<KEY extends keyof PROVIDERS>(
    id: KEY extends string ? `${KEY & string}${SEPARATOR}${string}` : never,
  ): LanguageModelV4;

  embeddingModel<KEY extends keyof PROVIDERS>(
    id: KEY extends string
      ? `${KEY & string}${SEPARATOR}${ExtractLiteralUnion<Parameters<NonNullable<PROVIDERS[KEY]['embeddingModel']>>[0]>}`
      : never,
  ): EmbeddingModelV4;
  embeddingModel<KEY extends keyof PROVIDERS>(
    id: KEY extends string ? `${KEY & string}${SEPARATOR}${string}` : never,
  ): EmbeddingModelV4;

  imageModel<KEY extends keyof PROVIDERS>(
    id: KEY extends string
      ? `${KEY & string}${SEPARATOR}${ExtractLiteralUnion<Parameters<NonNullable<PROVIDERS[KEY]['imageModel']>>[0]>}`
      : never,
  ): ImageModelV4;
  imageModel<KEY extends keyof PROVIDERS>(
    id: KEY extends string ? `${KEY & string}${SEPARATOR}${string}` : never,
  ): ImageModelV4;

  transcriptionModel<KEY extends keyof PROVIDERS>(
    id: KEY extends string
      ? `${KEY & string}${SEPARATOR}${ExtractLiteralUnion<Parameters<NonNullable<PROVIDERS[KEY]['transcriptionModel']>>[0]>}`
      : never,
  ): TranscriptionModelV4;
  transcriptionModel<KEY extends keyof PROVIDERS>(
    id: KEY extends string ? `${KEY & string}${SEPARATOR}${string}` : never,
  ): TranscriptionModelV4;

  speechModel<KEY extends keyof PROVIDERS>(
    id: KEY extends string
      ? `${KEY & string}${SEPARATOR}${ExtractLiteralUnion<Parameters<NonNullable<PROVIDERS[KEY]['speechModel']>>[0]>}`
      : never,
  ): SpeechModelV4;
  speechModel<KEY extends keyof PROVIDERS>(
    id: KEY extends string ? `${KEY & string}${SEPARATOR}${string}` : never,
  ): SpeechModelV4;

  rerankingModel<KEY extends keyof PROVIDERS>(
    id: KEY extends string
      ? `${KEY & string}${SEPARATOR}${ExtractLiteralUnion<Parameters<NonNullable<PROVIDERS[KEY]['rerankingModel']>>[0]>}`
      : never,
  ): RerankingModelV4;
  rerankingModel<KEY extends keyof PROVIDERS>(
    id: KEY extends string ? `${KEY & string}${SEPARATOR}${string}` : never,
  ): RerankingModelV4;

  videoModel<KEY extends keyof PROVIDERS>(
    id: KEY extends string ? `${KEY & string}${SEPARATOR}${string}` : never,
  ): Experimental_VideoModelV4;

  files<KEY extends keyof PROVIDERS>(providerId: KEY & string): FilesV4;
  skills<KEY extends keyof PROVIDERS>(providerId: KEY & string): SkillsV4;
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
 * @param options.imageModelMiddleware - Optional middleware to be applied to all image models from the registry. When multiple middlewares are provided, the first middleware will transform the input first, and the last middleware will be wrapped directly around the model.
 * @returns A new ProviderRegistryProvider instance that provides access to all registered providers with optional middleware applied to language and image models.
 */
export function createProviderRegistry<
  PROVIDERS extends Record<string, ProviderV2 | ProviderV3 | ProviderV4>,
  SEPARATOR extends string = ':',
>(
  providers: PROVIDERS,
  {
    separator = ':' as SEPARATOR,
    languageModelMiddleware,
    imageModelMiddleware,
  }: {
    separator?: SEPARATOR;
    languageModelMiddleware?:
      | LanguageModelMiddleware
      | LanguageModelMiddleware[];
    imageModelMiddleware?: ImageModelMiddleware | ImageModelMiddleware[];
  } = {},
): ProviderRegistryProvider<{ [K in keyof PROVIDERS]: ProviderV4 }, SEPARATOR> {
  type V4Providers = { [K in keyof PROVIDERS]: ProviderV4 };
  const registry = new DefaultProviderRegistry<V4Providers, SEPARATOR>({
    separator,
    languageModelMiddleware,
    imageModelMiddleware,
  });

  for (const [id, provider] of Object.entries(providers)) {
    registry.registerProvider({ id, provider: asProviderV4(provider) } as {
      id: keyof V4Providers;
      provider: V4Providers[keyof V4Providers];
    });
  }

  return registry;
}

/**
 * @deprecated Use `createProviderRegistry` instead.
 */
export const experimental_createProviderRegistry = createProviderRegistry;

class DefaultProviderRegistry<
  PROVIDERS extends Record<string, ProviderV4>,
  SEPARATOR extends string,
> implements ProviderRegistryProvider<PROVIDERS, SEPARATOR> {
  private providers: PROVIDERS = {} as PROVIDERS;
  private separator: SEPARATOR;
  private languageModelMiddleware?:
    | LanguageModelMiddleware
    | LanguageModelMiddleware[];
  private imageModelMiddleware?: ImageModelMiddleware | ImageModelMiddleware[];

  constructor({
    separator,
    languageModelMiddleware,
    imageModelMiddleware,
  }: {
    separator: SEPARATOR;
    languageModelMiddleware?:
      | LanguageModelMiddleware
      | LanguageModelMiddleware[];
    imageModelMiddleware?: ImageModelMiddleware | ImageModelMiddleware[];
  }) {
    this.separator = separator;
    this.languageModelMiddleware = languageModelMiddleware;
    this.imageModelMiddleware = imageModelMiddleware;
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
      | 'embeddingModel'
      | 'imageModel'
      | 'transcriptionModel'
      | 'speechModel'
      | 'rerankingModel'
      | 'videoModel',
  ): ProviderV4 {
    const provider = this.providers[id as keyof PROVIDERS];

    if (provider == null) {
      throw new NoSuchProviderError({
        modelId: id,
        modelType,
        providerId: id,
        availableProviders: Object.keys(this.providers),
      });
    }

    return asProviderV4(provider);
  }

  private splitId(
    id: string,
    modelType:
      | 'languageModel'
      | 'embeddingModel'
      | 'imageModel'
      | 'transcriptionModel'
      | 'speechModel'
      | 'rerankingModel'
      | 'videoModel',
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
  ): LanguageModelV4 {
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

  embeddingModel<KEY extends keyof PROVIDERS>(
    id: `${KEY & string}${SEPARATOR}${string}`,
  ): EmbeddingModelV4 {
    const [providerId, modelId] = this.splitId(id, 'embeddingModel');
    const provider = this.getProvider(providerId, 'embeddingModel');

    const model = provider.embeddingModel?.(modelId);

    if (model == null) {
      throw new NoSuchModelError({
        modelId: id,
        modelType: 'embeddingModel',
      });
    }

    return model;
  }

  imageModel<KEY extends keyof PROVIDERS>(
    id: `${KEY & string}${SEPARATOR}${string}`,
  ): ImageModelV4 {
    const [providerId, modelId] = this.splitId(id, 'imageModel');
    const provider = this.getProvider(providerId, 'imageModel');

    let model = provider.imageModel?.(modelId);

    if (model == null) {
      throw new NoSuchModelError({ modelId: id, modelType: 'imageModel' });
    }

    if (this.imageModelMiddleware != null) {
      model = wrapImageModel({
        model,
        middleware: this.imageModelMiddleware,
      });
    }

    return model;
  }

  transcriptionModel<KEY extends keyof PROVIDERS>(
    id: `${KEY & string}${SEPARATOR}${string}`,
  ): TranscriptionModelV4 {
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
  ): SpeechModelV4 {
    const [providerId, modelId] = this.splitId(id, 'speechModel');
    const provider = this.getProvider(providerId, 'speechModel');

    const model = provider.speechModel?.(modelId);

    if (model == null) {
      throw new NoSuchModelError({ modelId: id, modelType: 'speechModel' });
    }

    return model;
  }

  rerankingModel<KEY extends keyof PROVIDERS>(
    id: `${KEY & string}${SEPARATOR}${string}`,
  ): RerankingModelV4 {
    const [providerId, modelId] = this.splitId(id, 'rerankingModel');
    const provider = this.getProvider(providerId, 'rerankingModel');

    const model = provider.rerankingModel?.(modelId);

    if (model == null) {
      throw new NoSuchModelError({ modelId: id, modelType: 'rerankingModel' });
    }

    return model;
  }

  videoModel<KEY extends keyof PROVIDERS>(
    id: `${KEY & string}${SEPARATOR}${string}`,
  ): Experimental_VideoModelV4 {
    const [providerId, modelId] = this.splitId(id, 'videoModel');
    const provider = this.getProvider(providerId, 'videoModel');

    const model = (provider as any).videoModel?.(modelId);

    if (model == null) {
      throw new NoSuchModelError({ modelId: id, modelType: 'videoModel' });
    }

    return model;
  }

  files<KEY extends keyof PROVIDERS>(providerId: KEY & string): FilesV4 {
    const providerInstance = this.providers[providerId as keyof PROVIDERS];

    if (providerInstance == null) {
      throw new NoSuchProviderError({
        modelId: providerId,
        modelType: 'languageModel',
        providerId,
        availableProviders: Object.keys(this.providers),
      });
    }

    const filesInterface = asProviderV4(providerInstance).files?.();

    if (filesInterface == null) {
      throw new Error(
        `Provider '${providerId}' does not support files. ` +
          `Make sure the provider has a files() method.`,
      );
    }

    return filesInterface;
  }

  skills<KEY extends keyof PROVIDERS>(providerId: KEY & string): SkillsV4 {
    const providerInstance = this.providers[providerId as keyof PROVIDERS];

    if (providerInstance == null) {
      throw new NoSuchProviderError({
        modelId: providerId,
        modelType: 'languageModel',
        providerId,
        availableProviders: Object.keys(this.providers),
      });
    }

    const skillsInterface = asProviderV4(providerInstance).skills?.();

    if (skillsInterface == null) {
      throw new Error(
        `Provider '${providerId}' does not support skills. ` +
          `Make sure the provider has a skills() method.`,
      );
    }

    return skillsInterface;
  }
}
