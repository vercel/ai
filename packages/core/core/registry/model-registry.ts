import { LanguageModel } from '../types';
import { NoSuchModelError } from './no-such-model-error';

export class ModelRegistry {
  // id -> model
  private models: Record<string, LanguageModel> = {};

  // prefix -> provider
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
    prefix,
    provider,
  }: {
    prefix: string;
    provider: (id: string) => LanguageModel;
  }): void {
    this.providers[prefix] = provider;
  }

  /**
Returns the language model with the given id.
The id can either be a registered model id or use a provider prefix

@param id - The id of the model to return.
   */
  languageModel(id: string): LanguageModel {
    const model = this.models[id];

    if (model) {
      return model;
    }

    if (!id.includes(':')) {
      throw new NoSuchModelError({ modelId: id });
    }

    const [prefix, modelId] = id.split(':');

    const provider = this.providers[prefix];

    return provider(modelId);
  }
}
