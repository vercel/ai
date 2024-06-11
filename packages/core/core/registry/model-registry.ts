import { LanguageModel } from '../types';
import { NoSuchModelError } from './no-such-model-error';

export class ModelRegistry {
  private models: Record<string, LanguageModel> = {};

  registerLanguageModel({ id, model }: { id: string; model: LanguageModel }) {
    this.models[id] = model;
  }

  languageModel(id: string): LanguageModel {
    const model = this.models[id];

    if (!model) {
      throw new NoSuchModelError({ modelId: id });
    }

    return model;
  }
}
