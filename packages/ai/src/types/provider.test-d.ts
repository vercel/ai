import { describe, expectTypeOf, it } from 'vitest';
import { Provider } from './provider';
import { LanguageModel } from './language-model';
import { EmbeddingModel } from './embedding-model';
import { ImageModel } from './image-model';

describe('Provider types', () => {
  it('should allow a provider without rerankingModel to satisfy Provider', () => {
    const minimalProvider: Provider = {
      languageModel: (_modelId: string) => ({}) as LanguageModel,
      embeddingModel: (_modelId: string) => ({}) as EmbeddingModel,
      imageModel: (_modelId: string) => ({}) as ImageModel,
    };

    expectTypeOf(minimalProvider).toMatchTypeOf<Provider>();
  });

  it('should allow a provider with rerankingModel to satisfy Provider', () => {
    const fullProvider: Provider = {
      languageModel: (_modelId: string) => ({}) as LanguageModel,
      embeddingModel: (_modelId: string) => ({}) as EmbeddingModel,
      imageModel: (_modelId: string) => ({}) as ImageModel,
      rerankingModel: (_modelId: string) =>
        ({}) as ReturnType<NonNullable<Provider['rerankingModel']>>,
    };

    expectTypeOf(fullProvider).toMatchTypeOf<Provider>();
  });
});
