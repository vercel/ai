import assert from 'node:assert/strict';
import { fal } from '@ai-sdk/fal';
import {
  NoSuchModelError,
  type Experimental_VideoModelV3,
  type ProviderV2,
} from '@ai-sdk/provider';
import { customProvider } from 'ai';

const modelId = 'fal-ai/kling-video/v2.1/standard/text-to-video';
const failureSignal =
  'ISSUE #21110: customProvider fallback lost the v2 provider video model';

type ProviderV2WithVideo = ProviderV2 & {
  video: Experimental_VideoModelV3;
  videoModel(modelId: string): Experimental_VideoModelV3;
};

function noSuchModel(
  modelId: string,
  modelType: NoSuchModelError['modelType'],
): never {
  throw new NoSuchModelError({ modelId, modelType });
}

async function main() {
  const currentFalModel = fal.videoModel(modelId);
  assert.equal(currentFalModel.specificationVersion, 'v3');

  const currentFallbackModel = customProvider({
    fallbackProvider: fal,
  }).videoModel(modelId);
  assert.equal(currentFallbackModel.specificationVersion, 'v3');

  const falV2LikeProvider: ProviderV2WithVideo = {
    video: currentFalModel,
    languageModel: id => noSuchModel(id, 'languageModel'),
    textEmbeddingModel: id => noSuchModel(id, 'embeddingModel'),
    imageModel: id => noSuchModel(id, 'imageModel'),
    videoModel(id) {
      assert.equal(id, modelId);
      return this.video;
    },
  };

  const directModel = falV2LikeProvider.videoModel(modelId);
  assert.equal(directModel.specificationVersion, 'v3');

  const aliasModel = customProvider({
    videoModels: { clip: directModel },
  }).videoModel('clip');
  assert.equal(aliasModel.specificationVersion, 'v3');

  let fallbackModel: Experimental_VideoModelV3;
  try {
    fallbackModel = customProvider({
      fallbackProvider: falV2LikeProvider,
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

  assert.equal(
    fallbackModel.specificationVersion,
    'v3',
    `${failureSignal}; fallback did not return a v3 video model`,
  );
  assert.equal(fallbackModel.provider, directModel.provider, failureSignal);
  assert.equal(fallbackModel.modelId, directModel.modelId, failureSignal);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
