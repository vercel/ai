import { LanguageModel } from '../types';
import { NoSuchModelError } from './no-such-model-error';
import { NoSuchProviderError } from './no-such-provider-error';

export class ModelRegistry {
  // model id -> model
  private models: Record<string, LanguageModel> = {};

  // provider id -> provider
  private providers: Record<string, (id: string) => LanguageModel> = {};

  registerLanguageModel({
    id,
    model,
  }: {
    id: string;
    model: LanguageModel;
  }): void {
    this.models[id] = model;
  }

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
The id can either be a registered model id or use a provider prefix

@param id - The id of the model to return.
   */
  languageModel(id: string): LanguageModel {
    let model = this.models[id];

    if (model) {
      return model;
    }

    if (!id.includes(':')) {
      throw new NoSuchModelError({ modelId: id });
    }

    const [providerId, modelId] = id.split(':');

    const provider = this.providers[providerId];

    if (!provider) {
      throw new NoSuchProviderError({ providerId });
    }

    model = provider(modelId);

    if (!model) {
      throw new NoSuchModelError({ modelId: id });
    }

    return model;
  }
}
