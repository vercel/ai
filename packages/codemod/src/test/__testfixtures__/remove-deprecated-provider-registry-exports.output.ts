// @ts-nocheck
import type { Provider} from 'ai';
import { experimental_createProviderRegistry } from 'ai';

function createProvider(): Provider {
  return {
    languageModel: () => null,
    textEmbeddingModel: () => null
  };
}

function createRegistry(): Provider {
  return experimental_createProviderRegistry({
    test: createProvider()
  });
}

const registry: Provider = createRegistry();
