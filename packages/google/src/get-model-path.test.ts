import { getModelPath } from './get-model-path';

it('should pass through model path for models/*', async () => {
  expect(getModelPath('models/some-model')).toEqual('models/some-model');
});

it('should pass through model path for tunedModels/*', async () => {
  expect(getModelPath('tunedModels/some-model')).toEqual(
    'tunedModels/some-model',
  );
});

it('should prefix model path for models/*', async () => {
  expect(getModelPath('some-model')).toEqual('models/some-model');
});
