import { LanguageModel } from '../types';
import { InvalidModelIdError } from './invalid-model-id-error';
import { NoSuchModelError } from './no-such-model-error';
import { NoSuchProviderError } from './no-such-provider-error';

/**
Registry for managing models. It enables getting a model with a string id.
 */
export type ModelRegistry = {
  /**
Returns the language model with the given id in the format `providerId:modelId`.
The model id is then passed to the provider function to get the model.

@param {string} id - The id of the model to return.

@throws {NoSuchModelError} If no model with the given id exists.
@throws {NoSuchProviderError} If no provider with the given id exists.

@returns {LanguageModel} The language model associated with the id.
   */
  languageModel(id: string): LanguageModel;
};

/**
 * Creates a model registry for the given providers.
 */
export function createModelRegistry(
  providers: Record<string, (id: string) => LanguageModel>,
): ModelRegistry {
  const registry = new DefaultModelRegistry();

  for (const [id, provider] of Object.entries(providers)) {
    registry.registerLanguageModelProvider({ id, provider });
  }

  return registry;
}

class DefaultModelRegistry implements ModelRegistry {
  // Mapping of provider id to provider
  private providers: Record<string, (id: string) => LanguageModel> = {};

  /**
Registers a language model provider with a given id.

@param {string} id - The id of the provider.
@param {(id: string) => LanguageModel} provider - The provider function to register.
   */
  registerLanguageModelProvider({
    id,
    provider,
  }: {
    id: string;
    provider: (id: string) => LanguageModel;
  }): void {
    this.providers[id] = provider;
  }

  /**
Returns the language model with the given id.
The id can either be a registered model id or use a provider prefix.
Provider ids are separated from the model id by a colon: `providerId:modelId`.
The model id is then passed to the provider function to get the model.

@param {string} id - The id of the model to return.

@throws {NoSuchModelError} If no model with the given id exists.
@throws {NoSuchProviderError} If no provider with the given id exists.

@returns {LanguageModel} The language model associated with the id.
   */
  languageModel(id: string): LanguageModel {
    if (!id.includes(':')) {
      throw new InvalidModelIdError({ id });
    }

    const [providerId, modelId] = id.split(':');

    const provider = this.providers[providerId];

    if (!provider) {
      throw new NoSuchProviderError({ providerId });
    }

    const model = provider(modelId);

    if (!model) {
      throw new NoSuchModelError({ modelId: id });
    }

    return model;
  }
}
