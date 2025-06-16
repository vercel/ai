// @ts-nocheck
import { experimental_Provider, experimental_ProviderRegistry, experimental_ModelRegistry, experimental_createModelRegistry } from 'ai';

function createProvider(): experimental_Provider {
  return {
    languageModel: () => null,
    textEmbeddingModel: () => null
  };
}

function createRegistry(): experimental_ProviderRegistry {
  return experimental_createModelRegistry({
    test: createProvider()
  });
}

const registry: experimental_ModelRegistry = createRegistry();
