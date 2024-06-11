import { LanguageModel } from '../types';
import { NoSuchModelError } from './no-such-model-error';

export class ModelRegistry {
  private models: Record<string, LanguageModel> = {};
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
Returns the language model with the given id. The model has to be registered with `registerLanguageModel`.

@param modelId - The id of the model to return.
   */
  languageModel(modelId: string): LanguageModel;
  /**
Returns the language model with the given id. The model is provided by the provider with the given id.
The provider has to be registered with `registerLanguageModelProvider`.

@param providerId - The id of the provider to use.
@param modelId - The id of the model to return.
 */
  languageModel(providerId: string, modelId: string): LanguageModel;
  languageModel(id1: string, id2?: string): LanguageModel {
    // if id2 is defined, we are using the registered model
    if (id2 === undefined) {
      const model = this.models[id1];

      if (!model) {
        throw new NoSuchModelError({ modelId: id1 });
      }

      return model;
    }

    // id2 is defined, we are using the provider
    const provider = this.providers[id1];

    return provider(id2);
  }
}
