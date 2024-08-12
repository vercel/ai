import { EmbeddingModel, LanguageModel } from '../types';
import { InvalidModelIdError } from './invalid-model-id-error';
import { NoSuchModelError } from './no-such-model-error';
import { NoSuchProviderError } from './no-such-provider-error';
import { experimental_Provider } from './provider';

/**
Registry for managing models. It enables getting a model with a string id.
 */
export type experimental_ProviderRegistry = {
  /**
Returns the language model with the given id in the format `providerId:modelId`.
The model id is then passed to the provider function to get the model.

@param {string} id - The id of the model to return.

@throws {NoSuchModelError} If no model with the given id exists.
@throws {NoSuchProviderError} If no provider with the given id exists.

@returns {LanguageModel} The language model associated with the id.
   */
  languageModel(id: string): LanguageModel;

  /**
Returns the text embedding model with the given id in the format `providerId:modelId`.
The model id is then passed to the provider function to get the model.

@param {string} id - The id of the model to return.

@throws {NoSuchModelError} If no model with the given id exists.
@throws {NoSuchProviderError} If no provider with the given id exists.

@returns {LanguageModel} The language model associated with the id.
   */
  textEmbeddingModel(id: string): EmbeddingModel<string>;
};

/**
 * @deprecated Use `experimental_ProviderRegistry` instead.
 */
export type experimental_ModelRegistry = experimental_ProviderRegistry;

/**
 * Creates a registry for the given providers.
 */
export function experimental_createProviderRegistry(
  providers: Record<string, experimental_Provider>,
): experimental_ProviderRegistry {
  const registry = new DefaultProviderRegistry();

  for (const [id, provider] of Object.entries(providers)) {
    registry.registerProvider({ id, provider });
  }

  return registry;
}

/**
 * @deprecated Use `experimental_createProviderRegistry` instead.
 */
export const experimental_createModelRegistry =
  experimental_createProviderRegistry;

class DefaultProviderRegistry implements experimental_ProviderRegistry {
  private providers: Record<string, experimental_Provider> = {};

  registerProvider({
    id,
    provider,
  }: {
    id: string;
    provider: experimental_Provider;
  }): void {
    this.providers[id] = provider;
  }

  private getProvider(id: string): experimental_Provider {
    const provider = this.providers[id];

    if (provider == null) {
      throw new NoSuchProviderError({
        providerId: id,
        availableProviders: Object.keys(this.providers),
      });
    }

    return provider;
  }

  private splitId(id: string): [string, string] {
    const index = id.indexOf(':');

    if (index === -1) {
      throw new InvalidModelIdError({ id });
    }

    return [id.slice(0, index), id.slice(index + 1)];
  }

  languageModel(id: string): LanguageModel {
    const [providerId, modelId] = this.splitId(id);
    const model = this.getProvider(providerId).languageModel?.(modelId);

    if (model == null) {
      throw new NoSuchModelError({ modelId: id, modelType: 'languageModel' });
    }

    return model;
  }

  textEmbeddingModel(id: string): EmbeddingModel<string> {
    const [providerId, modelId] = this.splitId(id);
    const provider = this.getProvider(providerId);

    const model =
      provider.textEmbeddingModel?.(modelId) ??
      provider.textEmbedding?.(modelId);

    if (model == null) {
      throw new NoSuchModelError({
        modelId: id,
        modelType: 'textEmbeddingModel',
      });
    }

    return model;
  }

  /**
   * @deprecated Use `textEmbeddingModel` instead.
   */
  textEmbedding(id: string): EmbeddingModel<string> {
    return this.textEmbeddingModel(id);
  }
}
