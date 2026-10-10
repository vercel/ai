import type {
  Experimental_VideoModelV4,
  LanguageModelV4,
  ProviderV4,
} from '@ai-sdk/provider';
import { createProviderRegistry } from 'ai';
import assert from 'node:assert/strict';

class LanguageProvider implements ProviderV4 {
  readonly specificationVersion = 'v4';
  readonly #name = 'example';

  languageModel(modelId: string): LanguageModelV4 {
    return {
      specificationVersion: 'v4',
      provider: this.#name,
      modelId,
      supportedUrls: {},
      async doGenerate() {
        throw new Error('unused');
      },
      async doStream() {
        throw new Error('unused');
      },
    };
  }

  embeddingModel(): never {
    throw new Error('unused');
  }

  imageModel(): never {
    throw new Error('unused');
  }
}

class LanguageAndVideoProvider extends LanguageProvider {
  videoModel(modelId: string): Experimental_VideoModelV4 {
    return {
      specificationVersion: 'v4',
      provider: this.languageModel(modelId).provider,
      modelId,
      maxVideosPerCall: 1,
      async doGenerate() {
        throw new Error('unused');
      },
    };
  }
}

async function main() {
  const languageOnlyProvider = new LanguageProvider();
  const languageAndVideoProvider = new LanguageAndVideoProvider();

  assert.equal(
    languageAndVideoProvider.languageModel('direct').provider,
    'example',
  );

  const languageOnlyRegistry = createProviderRegistry({
    example: languageOnlyProvider,
  });
  assert.equal(
    languageOnlyRegistry.languageModel('example:control').provider,
    'example',
  );

  const languageAndVideoRegistry = createProviderRegistry({
    example: languageAndVideoProvider,
  });
  assert.equal(
    languageAndVideoRegistry.videoModel('example:video').provider,
    'example',
  );

  try {
    assert.equal(
      languageAndVideoRegistry.languageModel('example:language').provider,
      'example',
    );
  } catch (error) {
    if (
      error instanceof TypeError &&
      /private (member|field)|did not declare/i.test(error.message)
    ) {
      console.error(
        'ISSUE_22571_REPRODUCED: registry.languageModel lost the original provider receiver when videoModel is present',
      );
      process.exitCode = 1;
      return;
    }

    throw error;
  }

  console.log('Issue #22571 did not reproduce.');
}

main().catch(error => {
  console.error('Unexpected reproduction harness failure:', error);
  process.exitCode = 2;
});
