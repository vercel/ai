import assert from 'node:assert/strict';
import {
  NoSuchModelError,
  type Experimental_VideoModelV3,
  type ProviderV3,
} from '@ai-sdk/provider';
import { createProviderRegistry, customProvider } from 'ai';

const modelId = 'fal-ai/kling-video/v2.1/standard/text-to-video';
const failureSignal =
  'ISSUE #21110: customProvider fallback did not return the v3 video model adapted to v4';

type ProviderV3WithVideo = ProviderV3 & {
  videoModel(modelId: string): Experimental_VideoModelV3;
};

function noSuchModel(
  modelId: string,
  modelType: NoSuchModelError['modelType'],
): never {
  throw new NoSuchModelError({ modelId, modelType });
}

const falV3LikeProvider: ProviderV3WithVideo = {
  specificationVersion: 'v3',
  languageModel: id => noSuchModel(id, 'languageModel'),
  embeddingModel: id => noSuchModel(id, 'embeddingModel'),
  imageModel: id => noSuchModel(id, 'imageModel'),
  videoModel(id) {
    assert.equal(id, modelId);

    return {
      specificationVersion: 'v3',
      provider: 'fal.video',
      modelId: id,
      maxVideosPerCall: 1,
      async doGenerate() {
        return {
          videos: [],
          warnings: [],
          response: {
            timestamp: new Date(0),
            modelId: id,
            headers: undefined,
          },
        };
      },
    };
  },
};

async function main() {
  const directModel = falV3LikeProvider.videoModel(modelId);
  assert.equal(directModel.specificationVersion, 'v3');

  const aliasModel = customProvider({
    videoModels: { clip: directModel },
  }).videoModel('clip');
  assert.equal(aliasModel.specificationVersion, 'v4');

  const registryModel = createProviderRegistry({
    fal: falV3LikeProvider,
  }).videoModel(`fal:${modelId}`);
  assert.equal(registryModel.specificationVersion, 'v4');

  let fallbackModel;
  try {
    fallbackModel = customProvider({
      fallbackProvider: falV3LikeProvider,
    }).videoModel(modelId);
  } catch (error) {
    if (
      NoSuchModelError.isInstance(error) &&
      error.modelId === modelId &&
      error.modelType === 'videoModel'
    ) {
      throw new Error(`${failureSignal}; received AI_NoSuchModelError`);
    }

    throw error;
  }

  assert.equal(fallbackModel.specificationVersion, 'v4', failureSignal);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
