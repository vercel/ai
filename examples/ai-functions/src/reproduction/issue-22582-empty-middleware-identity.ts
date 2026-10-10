import type {
  EmbeddingModelV4,
  ImageModelV4,
  LanguageModelV4,
} from '@ai-sdk/provider';
import assert from 'node:assert/strict';
import { wrapEmbeddingModel, wrapImageModel, wrapLanguageModel } from 'ai';

const expectedIdentity = {
  modelId: 'alias-model',
  provider: 'alias-provider',
};

const languageModel: LanguageModelV4 = {
  specificationVersion: 'v4',
  provider: 'original-provider',
  modelId: 'original-model',
  supportedUrls: {},
  async doGenerate() {
    throw new Error('unused');
  },
  async doStream() {
    throw new Error('unused');
  },
};

const embeddingModel: EmbeddingModelV4 = {
  specificationVersion: 'v4',
  provider: 'original-provider',
  modelId: 'original-model',
  maxEmbeddingsPerCall: 1,
  supportsParallelCalls: true,
  async doEmbed() {
    throw new Error('unused');
  },
};

const imageModel: ImageModelV4 = {
  specificationVersion: 'v4',
  provider: 'original-provider',
  modelId: 'original-model',
  maxImagesPerCall: 1,
  async doGenerate() {
    throw new Error('unused');
  },
};

function identity(model: { modelId: string; provider: string }) {
  return { modelId: model.modelId, provider: model.provider };
}

async function main() {
  const wrappers = [
    {
      name: 'wrapLanguageModel',
      run: (withMiddleware: boolean) =>
        wrapLanguageModel({
          model: languageModel,
          middleware: withMiddleware ? [{ specificationVersion: 'v4' }] : [],
          modelId: expectedIdentity.modelId,
          providerId: expectedIdentity.provider,
        }),
    },
    {
      name: 'wrapEmbeddingModel',
      run: (withMiddleware: boolean) =>
        wrapEmbeddingModel({
          model: embeddingModel,
          middleware: withMiddleware ? [{ specificationVersion: 'v4' }] : [],
          modelId: expectedIdentity.modelId,
          providerId: expectedIdentity.provider,
        }),
    },
    {
      name: 'wrapImageModel',
      run: (withMiddleware: boolean) =>
        wrapImageModel({
          model: imageModel,
          middleware: withMiddleware ? [{ specificationVersion: 'v4' }] : [],
          modelId: expectedIdentity.modelId,
          providerId: expectedIdentity.provider,
        }),
    },
  ];

  const failures: string[] = [];

  for (const wrapper of wrappers) {
    assert.deepEqual(
      identity(wrapper.run(true)),
      expectedIdentity,
      `${wrapper.name} control with one no-op middleware`,
    );

    const observed = identity(wrapper.run(false));
    if (
      observed.modelId !== expectedIdentity.modelId ||
      observed.provider !== expectedIdentity.provider
    ) {
      failures.push(
        `${wrapper.name}: observed ${observed.modelId}/${observed.provider}`,
      );
    }
  }

  if (failures.length > 0) {
    console.error(
      'ISSUE_22582_REPRODUCED: empty middleware ignored explicit modelId and providerId overrides\n' +
        failures.map(failure => `- ${failure}`).join('\n'),
    );
    process.exitCode = 1;
    return;
  }

  console.log('Issue #22582 did not reproduce.');
}

main().catch(error => {
  console.error('REPRODUCTION_HARNESS_ERROR', error);
  process.exitCode = 2;
});
