import { EmbeddingModelV1, LanguageModelV1 } from '@ai-sdk/provider';
import { Provider } from '../types';
import { NoSuchModelError } from '@ai-sdk/provider';

export function experimental_customProvider({
  languageModels,
  textEmbeddingModels,
  fallbackProvider,
}: {
  languageModels?: Record<string, LanguageModelV1>;
  textEmbeddingModels?: Record<string, EmbeddingModelV1<string>>;
  fallbackProvider?: Provider;
}): Provider {
  return {
    languageModel(modelId: string): LanguageModelV1 {
      if (languageModels != null && modelId in languageModels) {
        return languageModels[modelId];
      }

      if (fallbackProvider) {
        return fallbackProvider.languageModel(modelId);
      }

      throw new NoSuchModelError({ modelId, modelType: 'languageModel' });
    },

    textEmbeddingModel(modelId: string): EmbeddingModelV1<string> {
      if (textEmbeddingModels != null && modelId in textEmbeddingModels) {
        return textEmbeddingModels[modelId];
      }

      if (fallbackProvider) {
        return fallbackProvider.textEmbeddingModel(modelId);
      }

      throw new NoSuchModelError({ modelId, modelType: 'textEmbeddingModel' });
    },
  };
}
